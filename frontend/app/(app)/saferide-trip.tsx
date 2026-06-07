import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useAuth } from "../../src/AuthContext";
import { useTheme } from "../../src/ThemeContext";
import { api } from "../../src/api";
import { Button } from "../../src/ui";
import { radius } from "../../src/theme";

export default function SafeRideTripScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const { colors } = useTheme();
  const s = makeStyles(colors);

  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [trip, setTrip] = useState<any>(null);
  const [passengers, setPassengers] = useState<any[]>([]);
  const locationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadActive = useCallback(async () => {
    try {
      const res = await api.tripsActive();
      setTrip(res.trip || null);
      setPassengers(res.passengers || []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (state.status === "authed" && state.user.role !== "driver") {
      router.replace("/(app)/");
    }
    loadActive();
    return () => stopTracking();
  }, []);

  useEffect(() => {
    if (trip?.id) {
      startTracking(trip.id);
    } else {
      stopTracking();
    }
  }, [trip?.id]);

  const startTracking = (tripId: string) => {
    stopTracking();
    locationTimerRef.current = setInterval(async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        await api.tripsLocation({
          trip_id: tripId,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          speed: loc.coords.speed ?? 0,
          heading: loc.coords.heading ?? 0,
        }).catch(() => {});
      } catch {}
    }, 30000);
  };

  const stopTracking = () => {
    if (locationTimerRef.current) {
      clearInterval(locationTimerRef.current);
      locationTimerRef.current = null;
    }
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
      } catch {}
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
    if (!trip?.id || sharing) return;
    setSharing(true);
    try {
      const res = await api.tripsShare({ trip_id: trip.id });
      await Share.share({
        message: `Track my Tag n Ride trip live 📍\n${res.share_url}`,
        url: res.share_url,
      });
    } catch (e: any) {
      if (e?.message !== "User did not share") {
        Alert.alert("Could not generate link", e?.message || "Try again");
      }
    } finally {
      setSharing(false);
    }
  };

  const handleEndTrip = () => {
    Alert.alert(
      "End Trip?",
      "This will stop GPS tracking and close the passenger manifest.",
      [
        { text: "Cancel", style: "cancel" },
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
      await api.tripsEnd({ trip_id: trip.id, latitude: lat, longitude: lng });
      stopTracking();
      setTrip(null);
      setPassengers([]);
    } catch (e: any) {
      Alert.alert("Failed to end", e?.message || "Could not end trip");
    } finally { setEnding(false); }
  };

  if (state.status !== "authed") return null;

  const startedTime = trip?.started_at
    ? new Date(trip.started_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>

        <TouchableOpacity onPress={() => router.back()} style={s.backRow}>
          <Ionicons name="arrow-back" size={20} color={colors.cyan} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={s.title}>SafeRide Trip</Text>

        {loading ? (
          <ActivityIndicator color={colors.cyan} style={{ marginTop: 40 }} />
        ) : !trip ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}>
              <Ionicons name="shield-outline" size={48} color={colors.cyan} />
            </View>
            <Text style={s.emptyTitle}>No Active Trip</Text>
            <Text style={s.emptySub}>
              Start a trip to track your route and protect your passengers.
              {"\n\n"}Passengers who pay you will be automatically linked to this trip.
            </Text>
            <View style={{ marginTop: 28, width: "100%" }}>
              <Button
                label="Start SafeRide Trip"
                onPress={handleStartTrip}
                loading={starting}
                testID="start-trip-btn"
              />
            </View>
          </View>
        ) : (
          <>
            {/* Active banner */}
            <View style={s.activeBanner}>
              <View style={s.activeDot} />
              <Text style={s.activeBannerText}>TRIP ACTIVE</Text>
              <Text style={s.activeBannerRef}>{trip.trip_reference}</Text>
            </View>

            {/* Trip summary */}
            <View style={s.tripCard}>
              <TripRow label="STARTED" value={startedTime} colors={colors} />
              <TripRow label="PASSENGERS" value={String(trip.total_passengers || passengers.length)} colors={colors} accent={colors.cyan} />
              {trip.vehicle_plate ? <TripRow label="VEHICLE" value={trip.vehicle_plate} colors={colors} /> : null}
              {trip.total_revenue > 0 ? (
                <TripRow label="REVENUE" value={`R${(trip.total_revenue || 0).toFixed(2)}`} colors={colors} accent={colors.green} last />
              ) : null}
            </View>

            {/* GPS status */}
            <View style={s.gpsRow}>
              <Ionicons name="locate-outline" size={14} color={colors.green} />
              <Text style={s.gpsText}>GPS updating every 30 seconds</Text>
            </View>

            {/* Share button */}
            <TouchableOpacity
              style={s.shareBtn}
              onPress={handleShareTrip}
              disabled={sharing}
              activeOpacity={0.8}
              testID="share-trip-btn">
              {sharing ? (
                <ActivityIndicator size="small" color={colors.cyan} />
              ) : (
                <Ionicons name="share-outline" size={18} color={colors.cyan} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.shareBtnTitle}>Share Live Location</Text>
                <Text style={s.shareBtnSub}>Let family track this trip in real time</Text>
              </View>
              {!sharing && <Ionicons name="chevron-forward" size={16} color={colors.textDim} />}
            </TouchableOpacity>

            {/* Passengers */}
            <Text style={s.section}>PASSENGERS</Text>
            {passengers.length === 0 ? (
              <View style={s.noPass}>
                <Ionicons name="people-outline" size={32} color={colors.textDim} />
                <Text style={s.noPassTitle}>No passengers yet</Text>
                <Text style={s.noPassSub}>Passengers who pay you appear here automatically</Text>
              </View>
            ) : (
              passengers.map((p, i) => (
                <View key={p.id || i} style={s.passCard}>
                  <View style={s.passAvatar}>
                    <Ionicons name="person" size={16} color={colors.cyan} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.passName}>{p.passenger_name || "Passenger"}</Text>
                    <Text style={s.passMeta}>{p.passenger_phone || ""}</Text>
                    {p.boarded_at ? (
                      <Text style={s.passTime}>
                        {new Date(p.boarded_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={s.passAmt}>R{(p.payment_amount || 0).toFixed(2)}</Text>
                    <View style={[s.spBadge, {
                      backgroundColor: p.safety_profile_complete ? colors.green + "15" : "#FFD60A15",
                      borderColor: p.safety_profile_complete ? colors.green + "40" : "#FFD60A40",
                    }]}>
                      <Text style={[s.spBadgeText, { color: p.safety_profile_complete ? colors.green : "#FFD60A" }]}>
                        {p.safety_profile_complete ? "SafeRide" : "No Profile"}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}

            <TouchableOpacity onPress={loadActive} style={s.refreshBtn}>
              <Ionicons name="refresh-outline" size={15} color={colors.cyan} />
              <Text style={s.refreshText}>Refresh passengers</Text>
            </TouchableOpacity>

            {/* End trip */}
            <TouchableOpacity
              style={[s.endBtn, ending && { opacity: 0.6 }]}
              onPress={handleEndTrip}
              disabled={ending}
              testID="end-trip-btn">
              {ending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="stop-circle-outline" size={22} color="#fff" />
                  <Text style={s.endBtnText}>End Trip</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TripRow({ label, value, colors, accent, last }: { label: string; value: string; colors: any; accent?: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>{label}</Text>
      <Text style={{ color: accent || colors.text, fontSize: 14, fontWeight: "700" }}>{value}</Text>
    </View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { color: colors.cyan, fontSize: 15, fontWeight: "600" },
  title: { color: colors.text, fontSize: 24, fontWeight: "900", marginBottom: 20 },
  emptyWrap: { alignItems: "center", paddingTop: 30, paddingHorizontal: 20 },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.cyan, marginBottom: 20 },
  emptyTitle: { color: colors.text, fontSize: 22, fontWeight: "800", marginBottom: 10 },
  emptySub: { color: colors.textMuted, fontSize: 14, textAlign: "center", lineHeight: 22 },
  activeBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.green + "15", borderRadius: radius.md, borderWidth: 1, borderColor: colors.green + "40", padding: 14, marginBottom: 16 },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  activeBannerText: { color: colors.green, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  activeBannerRef: { color: colors.green + "aa", fontSize: 12, fontWeight: "600", marginLeft: "auto" },
  tripCard: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 14 },
  gpsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14 },
  gpsText: { color: colors.textMuted, fontSize: 12 },
  shareBtn: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cyan + "40", padding: 14, marginBottom: 20 },
  shareBtnTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
  shareBtnSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  section: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 12 },
  noPass: { alignItems: "center", padding: 32, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  noPassTitle: { color: colors.text, fontWeight: "700", marginTop: 10, fontSize: 15 },
  noPassSub: { color: colors.textMuted, fontSize: 12, marginTop: 4, textAlign: "center" },
  passCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8, gap: 10 },
  passAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center" },
  passName: { color: colors.text, fontWeight: "700", fontSize: 14 },
  passMeta: { color: colors.textMuted, fontSize: 12 },
  passTime: { color: colors.textDim, fontSize: 11 },
  passAmt: { color: colors.green, fontWeight: "800", fontSize: 15 },
  spBadge: { borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, marginTop: 4 },
  spBadgeText: { fontSize: 10, fontWeight: "700" },
  refreshBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 12, marginBottom: 8 },
  refreshText: { color: colors.cyan, fontSize: 13, fontWeight: "600" },
  endBtn: { backgroundColor: colors.red, borderRadius: radius.md, padding: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 8 },
  endBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
