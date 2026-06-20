import React, { useCallback, useState, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, Share,
  StyleSheet, Modal, Clipboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { useAuth } from "../../src/AuthContext";
import { useTheme } from "../../src/ThemeContext";
import { api, Wallet, Txn } from "../../src/api";
import { formatZAR, formatDate, radius } from "../../src/theme";

import { MapView, Marker, Polyline } from "../../src/MapComponents";

function todayStr() { return new Date().toDateString(); }

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

function liveDuration(startedAt: string | null | undefined): string {
  if (!startedAt) return "—";
  const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
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

  // New modals
  const [infoModal, setInfoModal] = useState(false);
  const [endConfirmModal, setEndConfirmModal] = useState(false);

  // Live timer
  const [tick, setTick] = useState(0);

  // GPS tracking
  const locationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const passengerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [currentLoc, setCurrentLoc] = useState<{ latitude: number; longitude: number; speed?: number } | null>(null);
  const [lastLocUpdate, setLastLocUpdate] = useState<Date | null>(null);
  const [refreshingPassengers, setRefreshingPassengers] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Taxi info
  const [cashPassengers, setCashPassengers] = useState(0);
  const [taxiCapacity, setTaxiCapacity] = useState(0);
  const [savingDetails, setSavingDetails] = useState(false);

  useEffect(() => {
    if (state.status === "authed" && state.user.role !== "driver") {
      router.replace("/(app)/");
    }
  }, [state.status]);

  // Live timer tick
  useEffect(() => {
    timerRef.current = setInterval(() => setTick(v => v + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
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
      if (activeRes.trip) {
        setCashPassengers(activeRes.trip.cash_passengers ?? 0);
        setTaxiCapacity(activeRes.trip.taxi_capacity ?? 0);
      }
      setHistory(histRes.slice(0, 10));
      setWallet(w);
      setAllTxns(txns);
      if (sp !== null) setSafetyComplete(!!sp?.profile_complete);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (trip?.id) {
      startTracking(trip.id);
      passengerTimerRef.current = setInterval(async () => {
        try {
          const res = await api.tripsActive();
          setPassengers(res.passengers || []);
          if (res.trip) setTrip((prev: any) => ({ ...prev, total_revenue: res.trip.total_revenue, total_passengers: res.trip.total_passengers }));
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
                  lat = loc.coords.latitude; lng = loc.coords.longitude;
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
      setCashPassengers(res.cash_passengers ?? 0);
      setTaxiCapacity(res.taxi_capacity ?? 0);
    } catch (e: any) {
      Alert.alert("Failed to start", e?.message || "Could not start trip. Please try again.");
    } finally { setStarting(false); }
  };

  const handleShareTrip = async () => {
    const shareTripId = trip?.id || tripSummary?.trip?.id;
    if (!shareTripId || sharing) return;
    setSharing(true);
    try {
      const res = await api.tripsShare({ trip_id: shareTripId });
      await Share.share({
        message: `Track my Tag n Ride trip live 📍\n${res.share_url}`,
        url: res.share_url,
      });
    } catch (e: any) {
      if (e?.message !== "User did not share") {
        Alert.alert("Could not generate link", e?.message || "Try again");
      }
    } finally { setSharing(false); }
  };

  // ── Replaced Alert.alert confirmation with proper modal ──
  const handleEndTripPress = () => {
    setEndConfirmModal(true);
  };

  const doEndTrip = async () => {
    if (!trip?.id) return;
    setEndConfirmModal(false);
    setEnding(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      // Best-effort GPS — 4s timeout, never blocks ending
      try {
        const loc = await Promise.race<any>([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise(resolve => setTimeout(resolve, 4000)),
        ]);
        if (loc?.coords) {
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
        }
      } catch {}
      const res = await api.tripsEnd({ trip_id: trip.id, latitude: lat, longitude: lng });
      stopTracking();
      setTripSummary(res);
      setTrip(null);
      setPassengers([]);
      setRouteCoords([]);
      setCurrentLoc(null);
      setCashPassengers(0);
      setTaxiCapacity(0);
      setDoneModal(true);
      api.tripsHistory().then(h => setHistory(h.slice(0, 10))).catch(() => {});
    } catch (e: any) {
      Alert.alert("Could not end trip", e?.message || "Please try again. If the problem persists, restart the app.");
    } finally { setEnding(false); }
  };

  const handleStartNewTrip = async () => {
    setDoneModal(false);
    await handleStartTrip();
  };

  const handleRefreshPassengers = async () => {
    if (refreshingPassengers) return;
    setRefreshingPassengers(true);
    try {
      const res = await api.tripsActive();
      setPassengers(res.passengers || []);
      if (res.trip) setTrip(res.trip);
    } catch (e: any) {
      Alert.alert("Refresh failed", e?.message || "Could not refresh");
    } finally { setRefreshingPassengers(false); }
  };

  const handleCopyRef = () => {
    if (!trip?.trip_reference) return;
    Clipboard.setString(trip.trip_reference);
    Alert.alert("Copied", "Trip reference copied to clipboard.");
  };

  const handleUpdateDetail = async (field: "cash_passengers" | "taxi_capacity", value: number) => {
    if (!trip?.id) return;
    setSavingDetails(true);
    try { await api.tripsUpdateDetails(trip.id, { [field]: value }); }
    catch (e: any) { Alert.alert("Could not save", e?.message || "Try again"); }
    finally { setSavingDetails(false); }
  };

  const adjustCashPassengers = (delta: number) => {
    const next = Math.max(0, cashPassengers + delta);
    setCashPassengers(next);
    handleUpdateDetail("cash_passengers", next);
  };

  const adjustTaxiCapacity = (delta: number) => {
    const next = Math.max(0, taxiCapacity + delta);
    setTaxiCapacity(next);
    handleUpdateDetail("taxi_capacity", next);
  };

  if (state.status !== "authed") return null;
  const s = makeStyles(colors);
  const bd = wallet ? computeTodayBreakdown(allTxns, wallet.today_gross, wallet.today_platform_fee) : null;
  const gross = Number(trip?.total_revenue || 0);
  const tripFee = Math.round(gross * 0.03 * 100) / 100;
  const tripNet = Math.round((gross - tripFee) * 100) / 100;
  const duration = trip?.started_at ? liveDuration(trip.started_at) : "—";

  // Seat fill percentage
  const totalOnBoard = passengers.length + cashPassengers;
  const fillPct = taxiCapacity > 0 ? Math.min(100, Math.round((totalOnBoard / taxiCapacity) * 100)) : 0;

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.cyan} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Trip Centre</Text>
          <Text style={s.subtitle}>Manage your trips and passenger safety</Text>
        </View>
        <TouchableOpacity onPress={() => { setRefreshing(true); load(); }} style={s.iconBtn}>
          <Ionicons name={refreshing ? "sync" : "refresh-outline"} size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.cyan} />}>

        {/* SafeRide profile banner */}
        {safetyComplete === false && (
          <TouchableOpacity style={s.safetyBanner} onPress={() => router.push("/(app)/safety")} activeOpacity={0.85}>
            <Ionicons name="warning" size={18} color="#FF8C00" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={s.safetyBannerTitle}>SafeRide profile incomplete</Text>
              <Text style={s.safetyBannerSub}>Set up emergency contacts — tap to complete</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#FF8C00" />
          </TouchableOpacity>
        )}

        {/* Today earnings card */}
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
              {(wallet.rating_count ?? 0) > 0 && (
                <View style={[s.earningsRow, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <Ionicons name="star" size={11} color="#FFD60A" />
                  <Text style={s.ratingText}>{wallet.rating_avg?.toFixed(1)} rating · {wallet.rating_count} review{(wallet.rating_count ?? 0) !== 1 ? "s" : ""}</Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* ─── Active trip or no trip ─── */}
        {loading ? (
          <ActivityIndicator color={colors.cyan} style={{ marginTop: 32 }} />
        ) : !trip ? (
          /* ── No active trip ── */
          <View style={s.noTripCard}>
            <View style={s.noTripIcon}>
              <Ionicons name="shield-checkmark" size={44} color={colors.green} />
            </View>
            <Text style={s.noTripTitle}>No Active Trip</Text>
            <Text style={s.noTripSub}>Start a SafeRide trip to protect your passengers and automatically track who is in your vehicle.</Text>

            {/* Start trip CTA */}
            <TouchableOpacity
              style={[s.startBtn, starting && { opacity: 0.6 }]}
              onPress={handleStartTrip}
              disabled={starting}
              testID="start-trip-btn">
              {starting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="shield-checkmark-outline" size={22} color="#fff" />
                  <Text style={s.startBtnText}>Start SafeRide Trip</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Feature bullets */}
            <View style={{ gap: 10, marginTop: 16, alignSelf: "stretch" }}>
              {[
                { icon: "shield-outline" as const, text: "Passengers auto-linked when they pay you" },
                { icon: "navigate-outline" as const, text: "Your GPS route recorded for safety" },
                { icon: "people-outline" as const, text: "Emergency contacts reachable in accidents" },
                { icon: "share-outline" as const, text: "Share live tracking link with family" },
              ].map(item => (
                <View key={item.text} style={s.featureRow}>
                  <View style={s.featureDot}>
                    <Ionicons name={item.icon} size={14} color={colors.cyan} />
                  </View>
                  <Text style={s.featureText}>{item.text}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          /* ── Active trip ── */
          <View style={[s.activeTripSection, { borderLeftColor: colors.green }]}>

            {/* Active banner — tap to copy reference */}
            <TouchableOpacity style={s.activeBanner} onPress={handleCopyRef} activeOpacity={0.7}>
              <View style={s.activeDot} />
              <Text style={s.activeBannerText}>SAFERIDE ACTIVE</Text>
              <View style={{ flex: 1 }} />
              <Text style={s.activeBannerRef}>{trip.trip_reference}</Text>
              <Ionicons name="copy-outline" size={12} color={colors.cyan} style={{ marginLeft: 6 }} />
            </TouchableOpacity>

            {/* Live timer + started */}
            <View style={s.timerRow} key={tick}>
              <View style={s.timerBlock}>
                <Text style={s.timerVal}>{duration}</Text>
                <Text style={s.timerLabel}>DURATION</Text>
              </View>
              <View style={s.timerDivider} />
              <View style={s.timerBlock}>
                <Text style={s.timerVal}>
                  {trip.started_at ? new Date(trip.started_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "—"}
                </Text>
                <Text style={s.timerLabel}>STARTED</Text>
              </View>
              <View style={s.timerDivider} />
              <View style={s.timerBlock}>
                <Text style={[s.timerVal, { color: colors.green }]}>{formatZAR(gross)}</Text>
                <Text style={s.timerLabel}>EARNED</Text>
              </View>
            </View>

            {/* Map or GPS fallback */}
            {MapView ? (
              <View style={s.mapWrap}>
                <MapView
                  style={s.map}
                  region={currentLoc ? { latitude: currentLoc.latitude, longitude: currentLoc.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 } : undefined}
                  showsUserLocation={false}
                  showsMyLocationButton={false}>
                  {currentLoc && (
                    <Marker coordinate={currentLoc} title="You">
                      <View style={s.carMarker}><Ionicons name="car-sport" size={16} color={colors.cyan} /></View>
                    </Marker>
                  )}
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
                <Ionicons name="location-outline" size={18} color={currentLoc ? colors.green : colors.textMuted} />
                {currentLoc ? (
                  <View style={{ alignItems: "center" }}>
                    <Text style={s.mapFallbackCoord}>{currentLoc.latitude.toFixed(5)}, {currentLoc.longitude.toFixed(5)}</Text>
                    <Text style={s.mapFallbackSub}>
                      {(currentLoc.speed ?? 0) > 0 ? `${Math.round((currentLoc.speed ?? 0) * 3.6)} km/h · ` : ""}
                      {lastLocUpdate ? `Updated ${timeAgo(lastLocUpdate.toISOString())}` : ""}
                    </Text>
                  </View>
                ) : (
                  <Text style={s.mapFallbackSub}>GPS tracking active · updates every 30s</Text>
                )}
              </View>
            )}

            {/* Share row */}
            <TouchableOpacity style={s.shareRow} onPress={handleShareTrip} activeOpacity={0.8} disabled={sharing}>
              {sharing ? <ActivityIndicator size="small" color={colors.cyan} /> : <Ionicons name="share-outline" size={18} color={colors.cyan} />}
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.shareRowTitle}>Share Live Tracking Link</Text>
                <Text style={s.shareRowSub}>Send to family — they can follow your route in real time</Text>
              </View>
              {!sharing && <Ionicons name="chevron-forward" size={16} color={colors.textDim} />}
            </TouchableOpacity>

            {/* Taxi info — capacity + cash passengers */}
            <View style={s.taxiInfoCard}>
              <View style={s.taxiInfoHeader}>
                <Ionicons name="car-outline" size={14} color={colors.cyan} />
                <Text style={s.taxiInfoTitle}>TAXI INFO</Text>
                {savingDetails && <ActivityIndicator size="small" color={colors.cyan} style={{ marginLeft: "auto" }} />}
              </View>

              <View style={s.taxiInfoRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.taxiInfoLabel}>Taxi Capacity</Text>
                  <Text style={s.taxiInfoSub}>Total seats in your taxi</Text>
                </View>
                <View style={s.stepper}>
                  <TouchableOpacity style={s.stepperBtn} onPress={() => adjustTaxiCapacity(-1)} activeOpacity={0.7}>
                    <Ionicons name="remove" size={16} color={colors.text} />
                  </TouchableOpacity>
                  <Text style={s.stepperVal}>{taxiCapacity || "—"}</Text>
                  <TouchableOpacity style={s.stepperBtn} onPress={() => adjustTaxiCapacity(1)} activeOpacity={0.7}>
                    <Ionicons name="add" size={16} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={[s.taxiInfoRow, { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.taxiInfoLabel}>Cash Passengers</Text>
                  <Text style={s.taxiInfoSub}>Paid cash — not via app</Text>
                </View>
                <View style={s.stepper}>
                  <TouchableOpacity style={s.stepperBtn} onPress={() => adjustCashPassengers(-1)} activeOpacity={0.7}>
                    <Ionicons name="remove" size={16} color={colors.text} />
                  </TouchableOpacity>
                  <Text style={s.stepperVal}>{cashPassengers}</Text>
                  <TouchableOpacity style={s.stepperBtn} onPress={() => adjustCashPassengers(1)} activeOpacity={0.7}>
                    <Ionicons name="add" size={16} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* On-board summary + fill bar */}
              <View style={s.onBoardRow}>
                <View style={s.onBoardStat}>
                  <Text style={s.onBoardVal}>{passengers.length}</Text>
                  <Text style={s.onBoardLabel}>App</Text>
                </View>
                <Text style={s.onBoardPlus}>+</Text>
                <View style={s.onBoardStat}>
                  <Text style={s.onBoardVal}>{cashPassengers}</Text>
                  <Text style={s.onBoardLabel}>Cash</Text>
                </View>
                <Text style={s.onBoardPlus}>=</Text>
                <View style={s.onBoardStat}>
                  <Text style={[s.onBoardVal, { color: fillPct >= 100 ? colors.red : fillPct >= 80 ? "#FFD60A" : colors.cyan }]}>
                    {totalOnBoard}
                  </Text>
                  <Text style={s.onBoardLabel}>{taxiCapacity > 0 ? `/ ${taxiCapacity}` : "on board"}</Text>
                </View>
              </View>

              {/* Capacity fill bar */}
              {taxiCapacity > 0 && (
                <View style={{ marginTop: 10 }}>
                  <View style={s.fillBarBg}>
                    <View style={[s.fillBarFill, {
                      width: `${fillPct}%` as any,
                      backgroundColor: fillPct >= 100 ? colors.red : fillPct >= 80 ? "#FFD60A" : colors.green,
                    }]} />
                  </View>
                  <Text style={{ color: colors.textDim, fontSize: 10, marginTop: 3, textAlign: "right" }}>
                    {fillPct}% full
                  </Text>
                </View>
              )}
            </View>

            {/* Passengers in trip */}
            <View style={s.sectionHeader}>
              <Text style={s.sectionLabel}>PASSENGERS IN VEHICLE</Text>
              <View style={s.countBadge}>
                <Text style={s.countBadgeText}>{passengers.length}</Text>
              </View>
              <TouchableOpacity onPress={handleRefreshPassengers} style={{ marginLeft: "auto" }} disabled={refreshingPassengers}>
                {refreshingPassengers
                  ? <ActivityIndicator size="small" color={colors.cyan} />
                  : <Ionicons name="refresh-outline" size={16} color={colors.textMuted} />}
              </TouchableOpacity>
            </View>

            {passengers.length === 0 ? (
              <View style={s.noPassCard}>
                <Ionicons name="people-outline" size={28} color={colors.textDim} />
                <Text style={s.noPassTitle}>Waiting for passengers</Text>
                <Text style={s.noPassSub}>Passengers who scan your QR and pay appear here automatically</Text>
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
                        Boarded {new Date(p.boarded_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
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
                        {p.safety_profile_complete ? "SafeRide" : "No profile"}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}

            {/* This trip earnings */}
            <View style={s.tripEarningsCard}>
              <Text style={s.sectionLabel}>THIS TRIP EARNINGS</Text>
              <View style={{ gap: 6, marginTop: 10 }}>
                <ERow label="Gross" value={formatZAR(gross)} colors={colors} />
                <ERow label="Platform fee 3%" value={`−${formatZAR(tripFee)}`} valueColor={colors.red} colors={colors} />
                <ERow label="NET THIS TRIP" value={formatZAR(tripNet)} valueColor={colors.green} bold last colors={colors} />
                <ERow label="App passengers" value={String(passengers.length)} colors={colors} />
                {cashPassengers > 0 && <ERow label="Cash passengers" value={String(cashPassengers)} colors={colors} />}
                <ERow label="Total on board" value={String(totalOnBoard)} bold colors={colors} />
              </View>
            </View>

            {/* ── ACTION BUTTONS ── */}
            <View style={s.actionRow}>
              <TouchableOpacity style={s.actionBtn} onPress={handleShareTrip} activeOpacity={0.7} disabled={sharing}>
                {sharing ? <ActivityIndicator size="small" color={colors.cyan} /> : <Ionicons name="share-outline" size={18} color={colors.cyan} />}
                <Text style={s.actionBtnText}>Share</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.actionBtn} onPress={() => setInfoModal(true)} activeOpacity={0.7} testID="info-btn">
                <Ionicons name="information-circle-outline" size={18} color={colors.cyan} />
                <Text style={s.actionBtnText}>Info</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.actionBtn} onPress={handleRefreshPassengers} disabled={refreshingPassengers} activeOpacity={0.7}>
                {refreshingPassengers ? <ActivityIndicator size="small" color={colors.cyan} /> : <Ionicons name="refresh-outline" size={18} color={colors.cyan} />}
                <Text style={s.actionBtnText}>Refresh</Text>
              </TouchableOpacity>
            </View>

            {/* ── END TRIP ── */}
            <TouchableOpacity
              style={[s.endBtn, ending && s.endBtnDisabled]}
              onPress={handleEndTripPress}
              disabled={ending}
              testID="end-trip-btn"
              activeOpacity={0.85}>
              {ending ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={s.endBtnText}>Ending trip…</Text>
                </View>
              ) : (
                <>
                  <Ionicons name="stop-circle-outline" size={22} color="#fff" />
                  <Text style={s.endBtnText}>End SafeRide Trip</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Recent trips */}
        {history.length > 0 && (
          <View style={{ marginTop: trip ? 8 : 0 }}>
            <View style={[s.sectionHeader, { marginBottom: 12 }]}>
              <Text style={s.sectionLabel}>RECENT TRIPS</Text>
            </View>
            <View style={{ gap: 8 }}>
              {history.map((h) => {
                const hGross = parseFloat(h.total_revenue || "0");
                const hFee = Math.round(hGross * 0.03 * 100) / 100;
                const hNet = Math.round((hGross - hFee) * 100) / 100;
                const isExpanded = expandedTrip === h.id;
                const durationMin = h.started_at && h.ended_at
                  ? Math.round((new Date(h.ended_at).getTime() - new Date(h.started_at).getTime()) / 60000)
                  : null;
                return (
                  <TouchableOpacity
                    key={h.id}
                    style={s.histCard}
                    onPress={() => setExpandedTrip(isExpanded ? null : h.id)}
                    activeOpacity={0.8}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.histDate}>
                        {h.started_at ? new Date(h.started_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                        {h.started_at ? ` · ${new Date(h.started_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}` : ""}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                        <Ionicons name="people-outline" size={11} color={colors.textMuted} />
                        <Text style={s.histMeta}>{h.total_passengers || h.passenger_count || 0} passengers</Text>
                        {durationMin !== null && <Text style={s.histMeta}>· {durationMin}m</Text>}
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
                      <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color={colors.textDim} style={{ marginTop: 6 }} />
                    </View>
                    {isExpanded && (
                      <View style={s.histExpanded}>
                        <ERow label="Gross" value={formatZAR(hGross)} colors={colors} />
                        <ERow label="Fee 3%" value={`−${formatZAR(hFee)}`} valueColor={colors.red} colors={colors} />
                        <ERow label="Net" value={formatZAR(hNet)} valueColor={colors.green} bold last colors={colors} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Start New Trip CTA (shown below history when no active trip) */}
        {!trip && !loading && (
          <TouchableOpacity
            style={[s.newTripRow, starting && { opacity: 0.6 }]}
            onPress={handleStartTrip}
            disabled={starting}
            activeOpacity={0.8}>
            {starting ? <ActivityIndicator size="small" color={colors.cyan} /> : <Ionicons name="add-circle-outline" size={20} color={colors.cyan} />}
            <Text style={s.newTripText}>Start a New Trip</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.cyan} />
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* ══════════════════════════════════════════
          TRIP INFO MODAL — full bottom sheet
      ══════════════════════════════════════════ */}
      <Modal visible={infoModal} transparent animationType="slide" onRequestClose={() => setInfoModal(false)}>
        <View style={s.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setInfoModal(false)} />
          <View style={s.infoSheet}>
            <View style={s.modalHandle} />

            {/* Header */}
            <View style={s.infoSheetHeader}>
              <View style={s.infoSheetIconWrap}>
                <Ionicons name="information-circle" size={28} color={colors.cyan} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.infoSheetTitle}>Trip Information</Text>
                <Text style={s.infoSheetSub}>Full details for this SafeRide trip</Text>
              </View>
              <TouchableOpacity onPress={() => setInfoModal(false)} style={s.closeBtn}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {trip ? (
                <>
                  {/* TRIP REFERENCE */}
                  <InfoSection title="TRIP REFERENCE" colors={colors}>
                    <TouchableOpacity style={s.refRow} onPress={handleCopyRef} activeOpacity={0.7}>
                      <Text style={s.refText}>{trip.trip_reference || "—"}</Text>
                      <View style={s.copyBadge}>
                        <Ionicons name="copy-outline" size={12} color={colors.cyan} />
                        <Text style={s.copyBadgeText}>Copy</Text>
                      </View>
                    </TouchableOpacity>
                  </InfoSection>

                  {/* TRIP DETAILS */}
                  <InfoSection title="TRIP DETAILS" colors={colors}>
                    <InfoRow label="Status" colors={colors}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green }} />
                        <Text style={{ color: colors.green, fontWeight: "700", fontSize: 13 }}>ACTIVE</Text>
                      </View>
                    </InfoRow>
                    <InfoRow label="Vehicle" value={trip.vehicle_plate || "—"} mono colors={colors} />
                    <InfoRow label="Started" value={trip.started_at ? new Date(trip.started_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "—"} colors={colors} />
                    <InfoRow label="Duration" value={duration} accent={colors.cyan} colors={colors} />
                    <InfoRow label="Date" value={trip.started_at ? new Date(trip.started_at).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : "—"} colors={colors} last />
                  </InfoSection>

                  {/* PASSENGERS */}
                  <InfoSection title="PASSENGERS" colors={colors}>
                    <InfoRow label="App passengers (paid)" value={String(passengers.length)} accent={colors.cyan} colors={colors} />
                    <InfoRow label="Cash passengers" value={String(cashPassengers)} colors={colors} />
                    <InfoRow label="Total on board" value={String(totalOnBoard)} accent={colors.text} bold colors={colors} />
                    {taxiCapacity > 0 && (
                      <InfoRow label="Taxi capacity" value={`${taxiCapacity} seats (${fillPct}% full)`} accent={fillPct >= 100 ? colors.red : fillPct >= 80 ? "#FFD60A" : colors.green} colors={colors} />
                    )}
                    <InfoRow label="SafeRide profiles" value={`${passengers.filter(p => p.safety_profile_complete).length} / ${passengers.length}`} last colors={colors} />
                  </InfoSection>

                  {/* EARNINGS */}
                  <InfoSection title="EARNINGS" colors={colors}>
                    <InfoRow label="Gross fare" value={formatZAR(gross)} colors={colors} />
                    <InfoRow label="Platform fee (3%)" value={`−${formatZAR(tripFee)}`} accent={colors.red} colors={colors} />
                    <InfoRow label="Net earnings" value={formatZAR(tripNet)} accent={colors.green} bold last colors={colors} />
                  </InfoSection>

                  {/* GPS */}
                  <InfoSection title="GPS LOCATION" colors={colors}>
                    {currentLoc ? (
                      <>
                        <InfoRow label="Latitude" value={currentLoc.latitude.toFixed(6)} mono colors={colors} />
                        <InfoRow label="Longitude" value={currentLoc.longitude.toFixed(6)} mono colors={colors} />
                        {(currentLoc.speed ?? 0) > 0 && (
                          <InfoRow label="Speed" value={`${Math.round((currentLoc.speed ?? 0) * 3.6)} km/h`} colors={colors} />
                        )}
                        <InfoRow label="Last update" value={lastLocUpdate ? timeAgo(lastLocUpdate.toISOString()) : "—"} accent={colors.green} last colors={colors} />
                      </>
                    ) : (
                      <View style={{ padding: 12, alignItems: "center" }}>
                        <Ionicons name="location-outline" size={24} color={colors.textDim} />
                        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 6 }}>No GPS location yet</Text>
                        <Text style={{ color: colors.textDim, fontSize: 11, marginTop: 2 }}>Location updates every 30 seconds</Text>
                      </View>
                    )}
                  </InfoSection>

                  {/* PASSENGER LIST */}
                  {passengers.length > 0 && (
                    <InfoSection title={`PASSENGER LIST (${passengers.length})`} colors={colors}>
                      {passengers.map((p, i) => (
                        <View key={p.id || i} style={[s.infoPassRow, i < passengers.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                          <View style={s.infoPassAvatar}>
                            <Ionicons name="person" size={14} color={colors.cyan} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.text, fontWeight: "600", fontSize: 13 }}>{p.passenger_name || "Passenger"}</Text>
                            {p.boarded_at && (
                              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                                {new Date(p.boarded_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                              </Text>
                            )}
                          </View>
                          <View style={{ alignItems: "flex-end" }}>
                            <Text style={{ color: colors.green, fontWeight: "700", fontSize: 13 }}>{formatZAR(p.payment_amount || 0)}</Text>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }}>
                              <Ionicons name={p.safety_profile_complete ? "shield-checkmark" : "warning-outline"} size={10} color={p.safety_profile_complete ? colors.green : "#FFD60A"} />
                              <Text style={{ color: p.safety_profile_complete ? colors.green : "#FFD60A", fontSize: 9, fontWeight: "700" }}>
                                {p.safety_profile_complete ? "SafeRide" : "No profile"}
                              </Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </InfoSection>
                  )}
                </>
              ) : (
                <View style={{ padding: 32, alignItems: "center" }}>
                  <Text style={{ color: colors.textMuted }}>No active trip</Text>
                </View>
              )}

              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════
          END TRIP CONFIRMATION MODAL
      ══════════════════════════════════════════ */}
      <Modal visible={endConfirmModal} transparent animationType="slide" onRequestClose={() => setEndConfirmModal(false)}>
        <View style={s.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setEndConfirmModal(false)} />
          <View style={s.endConfirmSheet}>
            <View style={s.modalHandle} />

            <View style={{ alignItems: "center", marginBottom: 20 }}>
              <View style={s.endConfirmIcon}>
                <Ionicons name="stop-circle" size={44} color={colors.red} />
              </View>
              <Text style={s.endConfirmTitle}>End SafeRide Trip?</Text>
              <Text style={s.endConfirmSub}>
                This will stop GPS tracking and close the passenger manifest. This cannot be undone.
              </Text>
            </View>

            {/* Trip summary preview */}
            {trip && (
              <View style={s.endConfirmSummary}>
                <View style={s.endConfirmRow}>
                  <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                  <Text style={s.endConfirmLabel}>Duration</Text>
                  <Text style={s.endConfirmVal}>{duration}</Text>
                </View>
                <View style={s.endConfirmRow}>
                  <Ionicons name="people-outline" size={14} color={colors.textMuted} />
                  <Text style={s.endConfirmLabel}>Total passengers</Text>
                  <Text style={s.endConfirmVal}>{totalOnBoard}</Text>
                </View>
                <View style={s.endConfirmRow}>
                  <Ionicons name="cash-outline" size={14} color={colors.textMuted} />
                  <Text style={s.endConfirmLabel}>Earned this trip</Text>
                  <Text style={[s.endConfirmVal, { color: colors.green }]}>{formatZAR(tripNet)}</Text>
                </View>
              </View>
            )}

            {/* Buttons */}
            <TouchableOpacity
              style={s.endConfirmBtn}
              onPress={doEndTrip}
              activeOpacity={0.85}
              testID="confirm-end-btn">
              <Ionicons name="stop-circle-outline" size={20} color="#fff" />
              <Text style={s.endConfirmBtnText}>Confirm — End Trip</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.keepGoingBtn}
              onPress={() => setEndConfirmModal(false)}
              activeOpacity={0.8}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.green} />
              <Text style={s.keepGoingText}>Keep Going</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════
          TRIP COMPLETE MODAL
      ══════════════════════════════════════════ */}
      <Modal visible={doneModal} transparent animationType="slide" onRequestClose={() => setDoneModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.doneSheet}>
            <View style={s.modalHandle} />
            <View style={s.doneIconWrap}>
              <Ionicons name="checkmark-circle" size={64} color={colors.green} />
            </View>
            <Text style={s.doneTitle}>TRIP COMPLETE</Text>
            <Text style={s.doneSub}>Great work! Your passengers are safe and your earnings are recorded.</Text>

            {tripSummary && (
              <View style={s.doneGrid}>
                <DoneStat label="Duration" value={`${tripSummary.duration_minutes}m`} colors={colors} />
                <DoneStat label="Passengers" value={String(tripSummary.total_passengers)} colors={colors} />
                <DoneStat label="Gross" value={formatZAR(tripSummary.gross_earnings)} colors={colors} />
                <DoneStat label="Net Earned" value={formatZAR(tripSummary.net_earnings)} colors={colors} accent={colors.green} />
              </View>
            )}

            <View style={{ gap: 12, marginTop: 20 }}>
              {/* Primary: Start New Trip */}
              <TouchableOpacity
                style={s.doneStartBtn}
                onPress={handleStartNewTrip}
                activeOpacity={0.85}
                disabled={starting}>
                {starting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="add-circle-outline" size={20} color="#fff" />
                    <Text style={s.doneStartBtnText}>Start New Trip</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Share last trip summary */}
              <TouchableOpacity
                style={s.doneShareBtn}
                onPress={handleShareTrip}
                activeOpacity={0.85}
                disabled={sharing}>
                {sharing ? (
                  <ActivityIndicator color={colors.cyan} size="small" />
                ) : (
                  <>
                    <Ionicons name="share-outline" size={18} color={colors.cyan} />
                    <Text style={s.doneShareBtnText}>Share Trip Summary</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Done */}
              <TouchableOpacity style={s.doneDoneBtn} onPress={() => setDoneModal(false)} activeOpacity={0.8}>
                <Text style={s.doneDoneBtnText}>Done — Go to Home</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Sub-components ───────────────────────────────────────────

function ERow({ label, value, valueColor, bold, last, colors }: {
  label: string; value: string; valueColor?: string; bold?: boolean; last?: boolean; colors: any;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: bold ? "700" : "400" }}>{label}</Text>
      <Text style={{ color: valueColor || colors.text, fontSize: 13, fontWeight: bold ? "800" : "600" }}>{value}</Text>
    </View>
  );
}

function InfoSection({ title, children, colors }: { title: string; children: React.ReactNode; colors: any }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.4, marginBottom: 8 }}>{title}</Text>
      <View style={{ backgroundColor: colors.bg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 2 }}>
        {children}
      </View>
    </View>
  );
}

function InfoRow({ label, value, accent, bold, mono, last, colors, children }: {
  label: string; value?: string; accent?: string; bold?: boolean; mono?: boolean; last?: boolean; colors: any; children?: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 11, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{label}</Text>
      {children ? children : (
        <Text style={{ color: accent || colors.text, fontSize: 13, fontWeight: bold ? "800" : "600", fontFamily: mono ? "monospace" : undefined }}>
          {value}
        </Text>
      )}
    </View>
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

// ── Styles ───────────────────────────────────────────────────
const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14, gap: 12, backgroundColor: colors.bg },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border },
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
  ratingText: { color: colors.textMuted, fontSize: 11 },

  // No active trip
  noTripCard: { backgroundColor: colors.bg2, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 24, alignItems: "center", marginBottom: 16 },
  noTripIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.greenDim, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.green, marginBottom: 16 },
  noTripTitle: { color: colors.text, fontSize: 20, fontWeight: "800", marginBottom: 8 },
  noTripSub: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: 20 },
  startBtn: { width: "100%", backgroundColor: colors.green, borderRadius: 14, padding: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  startBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center" },
  featureText: { color: colors.textMuted, fontSize: 13, flex: 1 },

  // Active trip
  activeTripSection: { borderLeftWidth: 3, paddingLeft: 12, marginBottom: 16 },
  activeBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.green + "18", borderRadius: 10, borderWidth: 1, borderColor: colors.green + "50", padding: 12, marginBottom: 12 },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  activeBannerText: { color: colors.green, fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  activeBannerRef: { color: colors.cyan, fontSize: 11, fontFamily: "monospace" },

  // Live timer row
  timerRow: { flexDirection: "row", backgroundColor: colors.bg2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: "hidden" },
  timerBlock: { flex: 1, alignItems: "center", paddingVertical: 12 },
  timerDivider: { width: 1, backgroundColor: colors.border, marginVertical: 8 },
  timerVal: { color: colors.text, fontSize: 16, fontWeight: "900" },
  timerLabel: { color: colors.textDim, fontSize: 9, fontWeight: "700", letterSpacing: 1.2, marginTop: 2 },

  // Map
  mapWrap: { height: 200, borderRadius: 12, overflow: "hidden", marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  map: { flex: 1 },
  carMarker: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.cyan },
  passengerMarker: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  mapFallback: { height: 72, backgroundColor: colors.bg2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 12, flexDirection: "row" },
  mapFallbackCoord: { color: colors.cyan, fontSize: 11, fontFamily: "monospace" },
  mapFallbackSub: { color: colors.textMuted, fontSize: 11 },

  // Share row
  shareRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bg2, borderRadius: 10, borderWidth: 1, borderColor: colors.cyan + "40", padding: 14, marginBottom: 14 },
  shareRowTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
  shareRowSub: { color: colors.textMuted, fontSize: 11, marginTop: 1 },

  // Taxi info card
  taxiInfoCard: { backgroundColor: colors.bg2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 14 },
  taxiInfoHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14 },
  taxiInfoTitle: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, flex: 1 },
  taxiInfoRow: { flexDirection: "row", alignItems: "center" },
  taxiInfoLabel: { color: colors.text, fontWeight: "600", fontSize: 14 },
  taxiInfoSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  stepper: { flexDirection: "row", alignItems: "center" },
  stepperBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  stepperVal: { color: colors.text, fontSize: 20, fontWeight: "800", minWidth: 44, textAlign: "center" },
  onBoardRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 },
  onBoardStat: { alignItems: "center", minWidth: 48 },
  onBoardVal: { color: colors.text, fontSize: 24, fontWeight: "900" },
  onBoardLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "600", marginTop: 2 },
  onBoardPlus: { color: colors.textDim, fontSize: 20, fontWeight: "300" },
  fillBarBg: { height: 4, backgroundColor: colors.border, borderRadius: 2 },
  fillBarFill: { height: 4, borderRadius: 2 },

  // Section header
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  sectionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4 },
  countBadge: { backgroundColor: colors.greenDim, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  countBadgeText: { color: colors.green, fontSize: 10, fontWeight: "700" },

  // Passenger list
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

  // This trip earnings
  tripEarningsCard: { backgroundColor: colors.bg2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 14, marginTop: 4 },

  // Action buttons
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.bg2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 14 },
  actionBtnText: { color: colors.text, fontSize: 12, fontWeight: "700" },

  // End trip button
  endBtn: { backgroundColor: colors.red, borderRadius: 14, padding: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 8 },
  endBtnDisabled: { opacity: 0.6 },
  endBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },

  // History
  histCard: { backgroundColor: colors.bg2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: "row", flexWrap: "wrap" },
  histDate: { color: colors.text, fontWeight: "700", fontSize: 13 },
  histMeta: { color: colors.textMuted, fontSize: 11 },
  histRef: { color: colors.textDim, fontSize: 10, fontFamily: "monospace", marginTop: 3 },
  histNet: { color: colors.green, fontWeight: "800", fontSize: 16 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, marginTop: 4 },
  statusBadgeText: { fontSize: 10, fontWeight: "700" },
  histExpanded: { width: "100%", marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 },

  // Start new trip row
  newTripRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.bg2, borderRadius: 12, borderWidth: 1, borderColor: colors.cyan + "40", padding: 16, marginTop: 16 },
  newTripText: { flex: 1, color: colors.cyan, fontWeight: "700", fontSize: 15 },

  // Modal shared
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 20 },

  // Info modal
  infoSheet: { backgroundColor: colors.bg2, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 48, maxHeight: "90%", borderTopWidth: 1, borderColor: colors.border },
  infoSheetHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  infoSheetIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.cyan },
  infoSheetTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  infoSheetSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg3 ?? colors.border, alignItems: "center", justifyContent: "center" },
  refRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  refText: { color: colors.cyan, fontFamily: "monospace", fontSize: 13, fontWeight: "700", flex: 1 },
  copyBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.cyanDim, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: colors.cyan + "50" },
  copyBadgeText: { color: colors.cyan, fontSize: 11, fontWeight: "700" },
  infoPassRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  infoPassAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center" },

  // End confirm modal
  endConfirmSheet: { backgroundColor: colors.bg2, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 48, borderTopWidth: 1, borderColor: colors.red + "40" },
  endConfirmIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.red + "15", alignItems: "center", justifyContent: "center", marginBottom: 16, borderWidth: 2, borderColor: colors.red + "40" },
  endConfirmTitle: { color: colors.text, fontSize: 22, fontWeight: "900", marginBottom: 8 },
  endConfirmSub: { color: colors.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  endConfirmSummary: { backgroundColor: colors.bg, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 20, gap: 10 },
  endConfirmRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  endConfirmLabel: { color: colors.textMuted, fontSize: 13, flex: 1 },
  endConfirmVal: { color: colors.text, fontSize: 13, fontWeight: "700" },
  endConfirmBtn: { backgroundColor: colors.red, borderRadius: 14, padding: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 12 },
  endConfirmBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  keepGoingBtn: { borderRadius: 14, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.green + "50" },
  keepGoingText: { color: colors.green, fontSize: 15, fontWeight: "800" },

  // Done modal
  doneSheet: { backgroundColor: colors.bg2, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 48, borderTopWidth: 1, borderColor: colors.green + "40" },
  doneIconWrap: { alignItems: "center", marginBottom: 12 },
  doneTitle: { color: colors.green, fontSize: 26, fontWeight: "900", textAlign: "center", letterSpacing: 1 },
  doneSub: { color: colors.textMuted, fontSize: 14, textAlign: "center", marginTop: 6, marginBottom: 20, lineHeight: 20 },
  doneGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  doneStartBtn: { backgroundColor: colors.green, borderRadius: 14, padding: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  doneStartBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  doneShareBtn: { borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan + "50" },
  doneShareBtnText: { color: colors.cyan, fontWeight: "800", fontSize: 15 },
  doneDoneBtn: { borderRadius: 14, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  doneDoneBtnText: { color: colors.textMuted, fontSize: 14, fontWeight: "700" },
});
