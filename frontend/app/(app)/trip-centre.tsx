import React, { useCallback, useState, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, Share,
  Animated, StyleSheet, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { useAuth } from "../../src/AuthContext";
import { useTheme } from "../../src/ThemeContext";
import { api, Wallet, Txn } from "../../src/api";
import { formatZAR, formatDate, radius } from "../../src/theme";

// Safe map import — react-native-maps needs native build
let MapView: any = null;
let Marker: any = null;
let Polyline: any = null;
try {
  const RNMaps = require("react-native-maps");
  MapView = RNMaps.default;
  Marker = RNMaps.Marker;
  Polyline = RNMaps.Polyline;
} catch (_) {}

function todayStr() {
  return new Date().toDateString();
}

function computeTodayBreakdown(txns: Txn[], walletGross?: number, walletFee?: number) {
  const payments = txns.filter(
    t => t.type === "payment" && t.direction === "in" && t.status === "completed" &&
      new Date(t.created_at).toDateString() === todayStr()
  );
  if (walletGross !== undefined) {
    return { gross: walletGross, fee: walletFee ?? 0, net: walletGross - (walletFee ?? 0), trips: payments.length };
  }
  const gross = payments.reduce((s, t) => s + (t.gross_amount ?? t.amount + (t.platform_fee ?? 0)), 0);
  const fee = payments.reduce((s, t) => s + (t.platform_fee ?? 0), 0);
  return { gross, fee, net: gross - fee, trips: payments.length };
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function TripCentre() {
  const router = useRouter();
  const { state } = useAuth();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [trip, setTrip] = useState<any>(null);
  const [passengers, setPassengers] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [allTxns, setAllTxns] = useState<Txn[]>([]);
  const [safetyComplete, setSafetyComplete] = useState<boolean | null>(null);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [doneModal, setDoneModal] = useState(false);
  const [tripSummary, setTripSummary] = useState<any>(null);
  const [expandedTrip, setExpandedTrip] = useState<string | null>(null);
  const [ticker, setTicker] = useState(0);

  // GPS tracking
  const locationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const passengerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [currentLoc, setCurrentLoc] = useState<{ latitude: number; longitude: number; speed?: number } | null>(null);
  const [lastLocUpdate, setLastLocUpdate] = useState<Date | null>(null);

  // Panic button hold
  const panicProgress = useRef(new Animated.Value(0)).current;
  const panicAnim = useRef<Animated.CompositeAnimation | null>(null);
  const [panicSending, setPanicSending] = useState(false);
  const [tickInterval, setTickInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  // Redirect non-drivers immediately
  useEffect(() => {
    if (state.status === "authed" && state.user.role !== "driver") {
      router.replace("/(app)/");
    }
  }, [state.status]);

  // Tick for "X ago" live update
  useEffect(() => {
    const t = setInterval(() => setTicker(v => v + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const [activeRes, histRes, w, txns, sp] = await Promise.all([
        api.tripsActive(),
        api.tripsHistory(),
        api.wallet(),
        api.transactions(),
        api.safetyProfile().catch(() => null),
      ]);
      setTrip(activeRes.trip || null);
      setPassengers(activeRes.passengers || []);
      setHistory(histRes.slice(0, 10));
      setWallet(w);
      setAllTxns(txns);
      if (sp !== null) setSafetyComplete(!!sp?.profile_complete);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Start GPS tracking when trip becomes active
  useEffect(() => {
    if (trip?.id) {
      startTracking(trip.id);
      // Refresh passengers every 60s
      passengerTimerRef.current = setInterval(async () => {
        try {
          const res = await api.tripsActive();
          setPassengers(res.passengers || []);
        } catch {}
      }, 60000);
    } else {
      stopTracking();
      if (passengerTimerRef.current) { clearInterval(passengerTimerRef.current); passengerTimerRef.current = null; }
    }
    return () => {
      stopTracking();
      if (passengerTimerRef.current) { clearInterval(passengerTimerRef.current); passengerTimerRef.current = null; }
    };
  }, [trip?.id]);

  const startTracking = (tripId: string) => {
    stopTracking();
    locationTimerRef.current = setInterval(async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setCurrentLoc({ ...coord, speed: loc.coords.speed ?? 0 });
        setLastLocUpdate(new Date());
        setRouteCoords(prev => [...prev, coord]);
        await api.tripsLocation({ trip_id: tripId, latitude: coord.latitude, longitude: coord.longitude, speed: loc.coords.speed ?? 0, heading: loc.coords.heading ?? 0 }).catch(() => {});
      } catch {}
    }, 30000);
  };

  const stopTracking = () => {
    if (locationTimerRef.current) { clearInterval(locationTimerRef.current); locationTimerRef.current = null; }
  };

  const handleStartTrip = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    let lat: number | undefined;
    let lng: number | undefined;
    if (status === "granted") {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
        setCurrentLoc({ latitude: lat, longitude: lng });
        setRouteCoords([{ latitude: lat, longitude: lng }]);
      } catch {}
    } else {
      await new Promise<void>(resolve =>
        Alert.alert(
          "Location Access",
          "Location helps track your route for passenger safety.",
          [
            { text: "Allow Location", onPress: async () => {
              const res = await Location.requestForegroundPermissionsAsync();
              if (res.status === "granted") {
                try {
                  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                  lat = loc.coords.latitude;
                  lng = loc.coords.longitude;
                  setCurrentLoc({ latitude: lat, longitude: lng });
                  setRouteCoords([{ latitude: lat, longitude: lng }]);
                } catch {}
              }
              resolve();
            }},
            { text: "Start Without Location", style: "cancel", onPress: () => resolve() },
          ]
        )
      );
    }
    setStarting(true);
    try {
      const res = await api.tripsStart({ latitude: lat, longitude: lng });
      setTrip(res);
      setPassengers([]);
    } catch (e: any) {
      Alert.alert("Failed to start", e?.message || "Could not start trip");
    } finally { setStarting(false); }
  };

  const handleShareTrip = async () => {
    if (!trip?.id) return;
    try {
      const res = await api.tripsShare({ trip_id: trip.id });
      await Share.share({
        message: `Track my Tag n Ride trip live for safety:\n${res.share_url}\n\nMy route is recorded by Tag n Ride SafeRide.`,
        url: res.share_url,
      });
    } catch (e: any) {
      if (e?.message !== "User did not share") Alert.alert("Could not share", e?.message || "Try again");
    }
  };

  const handleEndTrip = () => {
    Alert.alert(
      "End Trip?",
      `Passengers: ${passengers.length}\nEarned this trip: ${formatZAR(trip?.total_revenue || 0)}\n\nThis stops route tracking and closes the manifest.`,
      [
        { text: "Keep Going", style: "cancel" },
        { text: "End Trip", style: "destructive", onPress: doEndTrip },
      ]
    );
  };

  const doEndTrip = async () => {
    if (!trip?.id) return;
    setEnding(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      } catch {}
      const res = await api.tripsEnd({ trip_id: trip.id, latitude: lat, longitude: lng });
      stopTracking();
      setTripSummary(res);
      setTrip(null);
      setPassengers([]);
      setRouteCoords([]);
      setCurrentLoc(null);
      setDoneModal(true);
      const histRes = await api.tripsHistory().catch(() => []);
      setHistory(histRes.slice(0, 10));
    } catch (e: any) {
      Alert.alert("Failed to end", e?.message || "Could not end trip");
    } finally { setEnding(false); }
  };

  const handleStartNewTrip = async () => {
    setDoneModal(false);
    await handleStartTrip();
  };

  const handlePanicStart = () => {
    if (panicSending) return;
    panicProgress.setValue(0);
    panicAnim.current = Animated.timing(panicProgress, {
      toValue: 1, duration: 3000, useNativeDriver: false,
    });
    panicAnim.current.start(async ({ finished }) => {
      if (!finished) return;
      panicProgress.setValue(0);
      await triggerPanic();
    });
  };

  const handlePanicEnd = () => {
    if (panicAnim.current) { panicAnim.current.stop(); panicAnim.current = null; }
    Animated.timing(panicProgress, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  };

  const triggerPanic = async () => {
    setPanicSending(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
        }
      } catch {}
      const res = await api.safetyPanic({ latitude: lat, longitude: lng });
      if (res.notifications_sent === 0) {
        Alert.alert(
          "No emergency contacts found",
          "Please complete your SafeRide profile with emergency contacts.",
          [
            { text: "Set Up Now", onPress: () => router.push("/(app)/safety") },
            { text: "Cancel", style: "cancel" },
          ]
        );
      } else {
        Alert.alert("SOS Sent", `Emergency alert sent to ${res.notifications_sent} contact(s).`);
      }
    } catch (e: any) {
      Alert.alert("SOS Failed", e?.message || "Could not send — call 10111 immediately.");
    } finally { setPanicSending(false); }
  };

  if (state.status !== "authed") return null;
  const s = makeStyles(colors);
  const bd = wallet ? computeTodayBreakdown(allTxns, wallet.today_gross, wallet.today_platform_fee) : null;
  const gross = trip?.total_revenue || 0;
  const tripFee = Math.round(gross * 0.03 * 100) / 100;
  const tripNet = Math.round((gross - tripFee) * 100) / 100;

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.cyan} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Trip Centre</Text>
          <Text style={s.subtitle}>Manage your trips and passenger safety</Text>
        </View>
        <TouchableOpacity onPress={() => { setRefreshing(true); load(); }} style={s.refreshBtn}>
          <Ionicons name="refresh-outline" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.cyan} />}>

        {/* Safety profile banner */}
        {safetyComplete === false && (
          <TouchableOpacity style={s.safetyBanner} onPress={() => router.push("/(app)/safety")} activeOpacity={0.85}>
            <Ionicons name="warning" size={18} color="#FF8C00" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={s.safetyBannerTitle}>Your SafeRide emergency profile is incomplete</Text>
              <Text style={s.safetyBannerSub}>Tap to set up your emergency contacts</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#FF8C00" />
          </TouchableOpacity>
        )}

        {/* Today earnings summary */}
        <View style={s.earningsCard}>
          <View style={s.earningsGlow} />
          <View style={s.earningsHeader}>
            <Ionicons name="cash-outline" size={14} color={colors.cyan} />
            <Text style={s.earningsHeaderLabel}>TODAY SO FAR</Text>
            {bd && bd.trips > 0 && (
              <View style={s.tripBadge}>
                <Text style={s.tripBadgeText}>{bd.trips} trip{bd.trips !== 1 ? "s" : ""}</Text>
              </View>
            )}
          </View>
          {!wallet ? (
            <ActivityIndicator color={colors.cyan} style={{ marginTop: 12 }} />
          ) : (
            <>
              <View style={s.earningsRow}>
                <Text style={s.earningsLabel}>Gross fare</Text>
                <Text style={s.earningsVal}>{formatZAR(bd?.gross ?? 0)}</Text>
              </View>
              <View style={s.earningsRow}>
                <Text style={s.earningsLabel}>Platform fee 3%</Text>
                <Text style={[s.earningsVal, { color: colors.red }]}>−{formatZAR(bd?.fee ?? 0)}</Text>
              </View>
              <View style={[s.earningsRow, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }]}>
                <Text style={[s.earningsLabel, { fontWeight: "800", color: colors.text }]}>NET EARNINGS</Text>
                <Text style={[s.earningsVal, { fontSize: 22, color: colors.cyan, fontWeight: "900" }]}>{formatZAR(bd?.net ?? 0)}</Text>
              </View>
              <View style={s.earningsFooter}>
                {(wallet.rating_count ?? 0) > 0 && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="star" size={11} color="#FFD60A" />
                    <Text style={s.ratingText}>{wallet.rating_avg?.toFixed(1)} · {wallet.rating_count} review{(wallet.rating_count ?? 0) !== 1 ? "s" : ""}</Text>
                  </View>
                )}
              </View>
            </>
          )}
        </View>

        {/* Active trip section */}
        {loading ? (
          <ActivityIndicator color={colors.cyan} style={{ marginTop: 32 }} />
        ) : !trip ? (
          /* ─ No active trip ─ */
          <View style={s.noTripCard}>
            <View style={s.noTripIcon}>
              <Ionicons name="shield-checkmark" size={40} color={colors.green} />
            </View>
            <Text style={s.noTripTitle}>No Active Trip</Text>
            <Text style={s.noTripSub}>Start a SafeRide trip to protect your passengers and automatically track who is in your vehicle.</Text>
            <TouchableOpacity
              style={[s.startBtn, starting && { opacity: 0.6 }]}
              onPress={handleStartTrip}
              disabled={starting}
              testID="start-trip-btn">
              {starting
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="shield-checkmark-outline" size={20} color="#fff" />
                    <Text style={s.startBtnText}>Start SafeRide Trip</Text>
                  </>}
            </TouchableOpacity>
            <View style={{ gap: 10, marginTop: 16, alignSelf: "stretch" }}>
              {[
                { icon: "shield-outline" as const, text: "Passengers auto-linked when they pay you" },
                { icon: "navigate-outline" as const, text: "Your route recorded for safety" },
                { icon: "people-outline" as const, text: "Emergency contacts reachable in accidents" },
              ].map(item => (
                <View key={item.text} style={s.infoRow}>
                  <Ionicons name={item.icon} size={16} color={colors.textMuted} />
                  <Text style={s.infoRowText}>{item.text}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          /* ─ Active trip ─ */
          <View style={[s.activeTripSection, { borderLeftColor: colors.green }]}>

            {/* Active banner */}
            <View style={s.activeBanner}>
              <View style={s.activeDot} />
              <Text style={s.activeBannerText}>SAFERIDE ACTIVE</Text>
              <Text style={s.activeBannerRef}>{trip.trip_reference}</Text>
            </View>

            {trip.started_at && (
              <Text style={s.startedText} key={ticker}>
                Started: {timeAgo(trip.started_at)}
              </Text>
            )}

            {/* Map or fallback */}
            {MapView ? (
              <View style={s.mapWrap}>
                <MapView
                  style={s.map}
                  region={currentLoc ? {
                    latitude: currentLoc.latitude,
                    longitude: currentLoc.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  } : undefined}
                  showsUserLocation={false}
                  showsMyLocationButton={false}>
                  {currentLoc && <Marker coordinate={currentLoc} title="You">
                    <View style={s.carMarker}><Ionicons name="car-sport" size={16} color={colors.cyan} /></View>
                  </Marker>}
                  {routeCoords.length > 1 && <Polyline coordinates={routeCoords} strokeColor={colors.cyan} strokeWidth={3} />}
                  {passengers.map((p, i) => p.boarding_lat && p.boarding_lng && (
                    <Marker key={p.id || i} coordinate={{ latitude: p.boarding_lat, longitude: p.boarding_lng }}>
                      <View style={s.passengerMarker}><Ionicons name="person" size={10} color="#fff" /></View>
                    </Marker>
                  ))}
                </MapView>
              </View>
            ) : (
              <View style={s.mapFallback}>
                <Ionicons name="location-outline" size={20} color={colors.cyan} />
                {currentLoc ? (
                  <>
                    <Text style={s.mapFallbackCoord}>
                      {currentLoc.latitude.toFixed(5)}, {currentLoc.longitude.toFixed(5)}
                    </Text>
                    {(currentLoc.speed ?? 0) > 0 && (
                      <Text style={s.mapFallbackSub}>{Math.round((currentLoc.speed ?? 0) * 3.6)} km/h</Text>
                    )}
                    {lastLocUpdate && <Text style={s.mapFallbackSub}>Updated {timeAgo(lastLocUpdate.toISOString())}</Text>}
                  </>
                ) : (
                  <Text style={s.mapFallbackSub}>GPS tracking active — location updates every 30s</Text>
                )}
              </View>
            )}

            {/* Share trip row */}
            <TouchableOpacity style={s.shareRow} onPress={handleShareTrip} activeOpacity={0.8}>
              <Ionicons name="share-outline" size={18} color={colors.cyan} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.shareRowTitle}>Share My Route</Text>
                <Text style={s.shareRowSub}>Let family track your location</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
            </TouchableOpacity>

            {/* Passengers in this trip */}
            <View style={s.sectionHeader}>
              <Text style={s.sectionLabel}>PASSENGERS IN VEHICLE</Text>
              <View style={s.countBadge}>
                <Text style={s.countBadgeText}>{passengers.length}</Text>
              </View>
            </View>

            {passengers.length === 0 ? (
              <View style={s.noPassCard}>
                <Ionicons name="people-outline" size={28} color={colors.textDim} />
                <Text style={s.noPassTitle}>Waiting for passengers</Text>
                <Text style={s.noPassSub}>Share your QR code to receive payments — they appear here automatically</Text>
              </View>
            ) : (
              passengers.map((p, i) => (
                <View key={p.id || i} style={s.passCard}>
                  <View style={s.passAvatar}>
                    <Ionicons name="person" size={16} color={colors.cyan} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.passName}>{p.passenger_name || "Passenger"}</Text>
                    {p.boarded_at && (
                      <Text style={s.passMeta}>
                        {new Date(p.boarded_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    )}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={s.passAmt}>{formatZAR(p.payment_amount || 0)}</Text>
                    <View style={[s.spBadge, {
                      backgroundColor: p.safety_profile_complete ? colors.green + "18" : "#FFD60A18",
                      borderColor: p.safety_profile_complete ? colors.green + "50" : "#FFD60A50",
                    }]}>
                      {p.safety_profile_complete
                        ? <Ionicons name="shield-checkmark" size={10} color={colors.green} />
                        : <Ionicons name="warning-outline" size={10} color="#FFD60A" />}
                      <Text style={[s.spBadgeText, { color: p.safety_profile_complete ? colors.green : "#FFD60A" }]}>
                        {p.safety_profile_complete ? "Safe" : "No emergency info"}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}

            {/* This trip earnings */}
            <View style={s.tripEarningsCard}>
              <Text style={s.sectionLabel}>THIS TRIP</Text>
              <View style={{ gap: 6, marginTop: 10 }}>
                <View style={s.earningsRow}>
                  <Text style={s.earningsLabel}>Gross</Text>
                  <Text style={s.earningsVal}>{formatZAR(gross)}</Text>
                </View>
                <View style={s.earningsRow}>
                  <Text style={s.earningsLabel}>Fee 3%</Text>
                  <Text style={[s.earningsVal, { color: colors.red }]}>−{formatZAR(tripFee)}</Text>
                </View>
                <View style={[s.earningsRow, { paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <Text style={[s.earningsLabel, { fontWeight: "800", color: colors.text }]}>NET THIS TRIP</Text>
                  <Text style={[s.earningsVal, { color: colors.green, fontWeight: "900" }]}>{formatZAR(tripNet)}</Text>
                </View>
                <View style={s.earningsRow}>
                  <Text style={s.earningsLabel}>Passengers</Text>
                  <Text style={s.earningsVal}>{trip.total_passengers || passengers.length}</Text>
                </View>
              </View>
            </View>

            {/* Trip action buttons */}
            <View style={s.actionRow}>
              <TouchableOpacity style={s.actionBtn} onPress={handleShareTrip}>
                <Ionicons name="share-outline" size={18} color={colors.cyan} />
                <Text style={s.actionBtnText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actionBtn} onPress={async () => {
                try {
                  const res = await api.tripsActive();
                  setPassengers(res.passengers || []);
                  if (res.trip) setTrip(res.trip);
                } catch {}
              }}>
                <Ionicons name="people-outline" size={18} color={colors.cyan} />
                <Text style={s.actionBtnText}>Refresh</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actionBtn} onPress={() => {
                Alert.alert(
                  "Trip Info",
                  `Reference: ${trip.trip_reference}\nVehicle: ${trip.vehicle_plate || "—"}\nPassengers: ${trip.total_passengers || passengers.length}`,
                );
              }}>
                <Ionicons name="information-circle-outline" size={18} color={colors.cyan} />
                <Text style={s.actionBtnText}>Info</Text>
              </TouchableOpacity>
            </View>

            {/* End trip */}
            <TouchableOpacity
              style={[s.endBtn, ending && { opacity: 0.6 }]}
              onPress={handleEndTrip}
              disabled={ending}
              testID="end-trip-btn">
              {ending
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="stop-circle-outline" size={20} color="#fff" />
                    <Text style={s.endBtnText}>End SafeRide Trip</Text>
                  </>}
            </TouchableOpacity>
          </View>
        )}

        {/* Recent trips */}
        {history.length > 0 && (
          <>
            <Text style={[s.sectionLabel, { marginTop: 24, marginBottom: 12 }]}>RECENT TRIPS</Text>
            <View style={{ gap: 8 }}>
              {history.map((h) => {
                const hGross = parseFloat(h.total_revenue || "0");
                const hFee = Math.round(hGross * 0.03 * 100) / 100;
                const hNet = Math.round((hGross - hFee) * 100) / 100;
                const isExpanded = expandedTrip === h.id;
                return (
                  <TouchableOpacity
                    key={h.id}
                    style={s.histCard}
                    onPress={() => setExpandedTrip(isExpanded ? null : h.id)}
                    activeOpacity={0.8}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.histDate}>
                        {h.started_at ? new Date(h.started_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                        <Ionicons name="people-outline" size={11} color={colors.textMuted} />
                        <Text style={s.histMeta}>{h.total_passengers || h.passenger_count || 0} passengers</Text>
                        {h.ended_at && h.started_at && (
                          <Text style={s.histMeta}>
                            · {Math.round((new Date(h.ended_at).getTime() - new Date(h.started_at).getTime()) / 60000)}m
                          </Text>
                        )}
                      </View>
                      <Text style={s.histRef}>{h.trip_reference}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={s.histNet}>{formatZAR(hNet)}</Text>
                      <View style={[s.statusBadge, { backgroundColor: h.status === "active" ? colors.cyan + "20" : colors.green + "18" }]}>
                        <Text style={[s.statusBadgeText, { color: h.status === "active" ? colors.cyan : colors.green }]}>
                          {h.status === "active" ? "Active" : "Completed"}
                        </Text>
                      </View>
                    </View>
                    {isExpanded && (
                      <View style={s.histExpanded}>
                        <View style={s.earningsRow}>
                          <Text style={s.earningsLabel}>Gross</Text>
                          <Text style={s.earningsVal}>{formatZAR(hGross)}</Text>
                        </View>
                        <View style={s.earningsRow}>
                          <Text style={s.earningsLabel}>Fee 3%</Text>
                          <Text style={[s.earningsVal, { color: colors.red }]}>−{formatZAR(hFee)}</Text>
                        </View>
                        <View style={s.earningsRow}>
                          <Text style={[s.earningsLabel, { color: colors.text, fontWeight: "700" }]}>Net</Text>
                          <Text style={[s.earningsVal, { color: colors.green, fontWeight: "800" }]}>{formatZAR(hNet)}</Text>
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {/* Panic button - fixed bottom right */}
      <View style={s.panicWrap} pointerEvents="box-none">
        <Animated.View style={[s.panicRing, {
          borderColor: colors.red,
          borderWidth: panicProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 3] }),
          transform: [{ scale: panicProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }],
        }]} pointerEvents="none" />
        <TouchableOpacity
          style={[s.panicBtn, panicSending && { opacity: 0.6 }]}
          onPressIn={handlePanicStart}
          onPressOut={handlePanicEnd}
          disabled={panicSending}
          testID="panic-btn">
          {panicSending
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.panicText}>SOS</Text>}
        </TouchableOpacity>
      </View>

      {/* Trip complete modal */}
      <Modal visible={doneModal} transparent animationType="slide" onRequestClose={() => {}}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={s.doneIconWrap}>
              <Ionicons name="checkmark-circle" size={64} color={colors.green} />
            </View>
            <Text style={s.doneTitle}>TRIP COMPLETE</Text>
            {tripSummary && (
              <View style={s.doneGrid}>
                <DoneStat label="Duration" value={`${tripSummary.duration_minutes}m`} colors={colors} />
                <DoneStat label="Passengers" value={String(tripSummary.total_passengers)} colors={colors} />
                <DoneStat label="Gross earned" value={formatZAR(tripSummary.gross_earnings)} colors={colors} />
                <DoneStat label="Net earned" value={formatZAR(tripSummary.net_earnings)} colors={colors} accent={colors.green} />
              </View>
            )}
            <View style={{ gap: 12, marginTop: 20 }}>
              <TouchableOpacity style={s.doneStartBtn} onPress={handleStartNewTrip}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
                <Text style={s.doneStartBtnText}>Start New Trip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.doneDoneBtn} onPress={() => setDoneModal(false)}>
                <Text style={s.doneDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DoneStat({ label, value, colors, accent }: { label: string; value: string; colors: any; accent?: string }) {
  return (
    <View style={{ width: "48%", backgroundColor: colors.bg, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10 }}>
      <Text style={{ color: colors.textDim, fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>{label.toUpperCase()}</Text>
      <Text style={{ color: accent || colors.text, fontSize: 20, fontWeight: "800", marginTop: 4 }}>{value}</Text>
    </View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14, gap: 12, backgroundColor: colors.bg },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border },
  refreshBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 20, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 1 },

  safetyBanner: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,140,0,0.12)", borderWidth: 1, borderColor: "rgba(255,140,0,0.4)", borderRadius: 12, padding: 14, marginBottom: 16 },
  safetyBannerTitle: { color: "#FF8C00", fontWeight: "700", fontSize: 13 },
  safetyBannerSub: { color: "rgba(255,140,0,0.8)", fontSize: 11, marginTop: 2 },

  earningsCard: { backgroundColor: colors.bg2, borderRadius: 16, borderWidth: 1, borderColor: colors.cyan + "50", padding: 16, marginBottom: 16, overflow: "hidden" },
  earningsGlow: { position: "absolute", top: -60, right: -60, width: 180, height: 180, borderRadius: 90, backgroundColor: colors.cyan, opacity: 0.05 },
  earningsHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  earningsHeaderLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, flex: 1 },
  tripBadge: { backgroundColor: colors.cyanDim, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  tripBadgeText: { color: colors.cyan, fontSize: 10, fontWeight: "700" },
  earningsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  earningsLabel: { color: colors.textMuted, fontSize: 12 },
  earningsVal: { color: colors.text, fontSize: 14, fontWeight: "700" },
  earningsFooter: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  ratingText: { color: colors.textMuted, fontSize: 11 },

  noTripCard: { backgroundColor: colors.bg2, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 24, alignItems: "center", marginBottom: 16 },
  noTripIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.greenDim, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.green, marginBottom: 16 },
  noTripTitle: { color: colors.text, fontSize: 20, fontWeight: "800", marginBottom: 8 },
  noTripSub: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: 20 },
  startBtn: { width: "100%", backgroundColor: colors.green, borderRadius: 12, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  startBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoRowText: { color: colors.textMuted, fontSize: 13, flex: 1 },

  activeTripSection: { borderLeftWidth: 3, paddingLeft: 12, marginBottom: 16 },
  activeBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.green + "18", borderRadius: 10, borderWidth: 1, borderColor: colors.green + "50", padding: 12, marginBottom: 8 },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  activeBannerText: { color: colors.green, fontWeight: "800", fontSize: 12, letterSpacing: 1, flex: 1 },
  activeBannerRef: { color: colors.cyan, fontSize: 11, fontFamily: "monospace" },
  startedText: { color: colors.textMuted, fontSize: 12, marginBottom: 10 },

  mapWrap: { height: 200, borderRadius: 12, overflow: "hidden", marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  map: { flex: 1 },
  carMarker: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.cyan },
  passengerMarker: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  mapFallback: { height: 80, backgroundColor: colors.bg2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 12 },
  mapFallbackCoord: { color: colors.cyan, fontSize: 12, fontFamily: "monospace" },
  mapFallbackSub: { color: colors.textMuted, fontSize: 11 },

  shareRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bg2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 16 },
  shareRowTitle: { color: colors.text, fontWeight: "600", fontSize: 14 },
  shareRowSub: { color: colors.textMuted, fontSize: 11, marginTop: 1 },

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  sectionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4 },
  countBadge: { backgroundColor: colors.greenDim, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  countBadgeText: { color: colors.green, fontSize: 10, fontWeight: "700" },

  noPassCard: { alignItems: "center", padding: 24, backgroundColor: colors.bg2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12, gap: 6 },
  noPassTitle: { color: colors.text, fontWeight: "700", fontSize: 14, marginTop: 6 },
  noPassSub: { color: colors.textMuted, fontSize: 12, textAlign: "center", lineHeight: 18 },

  passCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bg2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8, gap: 10 },
  passAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center" },
  passName: { color: colors.text, fontWeight: "700", fontSize: 14 },
  passMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  passAmt: { color: colors.green, fontWeight: "800", fontSize: 14 },
  spBadge: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, marginTop: 4 },
  spBadgeText: { fontSize: 9, fontWeight: "700" },

  tripEarningsCard: { backgroundColor: colors.bg2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 14, marginTop: 4 },

  actionRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.bg2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingVertical: 12 },
  actionBtnText: { color: colors.text, fontSize: 12, fontWeight: "600" },

  endBtn: { backgroundColor: colors.red, borderRadius: 12, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 8 },
  endBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  histCard: { backgroundColor: colors.bg2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: "row", flexWrap: "wrap" },
  histDate: { color: colors.text, fontWeight: "700", fontSize: 13 },
  histMeta: { color: colors.textMuted, fontSize: 11 },
  histRef: { color: colors.textDim, fontSize: 10, fontFamily: "monospace", marginTop: 3 },
  histNet: { color: colors.green, fontWeight: "800", fontSize: 16 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, marginTop: 4 },
  statusBadgeText: { fontSize: 10, fontWeight: "700" },
  histExpanded: { width: "100%", marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 },

  panicWrap: { position: "absolute", bottom: 24, right: 20, alignItems: "center", justifyContent: "center" },
  panicRing: { position: "absolute", width: 72, height: 72, borderRadius: 36 },
  panicBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.red, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: colors.red, shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  panicText: { color: "#fff", fontWeight: "900", fontSize: 13, letterSpacing: 1 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: colors.bg2, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 48, borderTopWidth: 1, borderColor: colors.green + "40" },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 20 },
  doneIconWrap: { alignItems: "center", marginBottom: 12 },
  doneTitle: { color: colors.green, fontSize: 24, fontWeight: "900", textAlign: "center", letterSpacing: 1, marginBottom: 20 },
  doneGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  doneStartBtn: { backgroundColor: colors.green, borderRadius: 12, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  doneStartBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  doneDoneBtn: { borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  doneDoneBtnText: { color: colors.text, fontSize: 14, fontWeight: "700" },
});
