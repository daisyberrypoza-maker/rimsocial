import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import Avatar from '../components/Avatar';
import { api } from '../api';
import { useAppStore } from '../store';
import { logError } from '../lib/toast';
import { colors } from '../theme';

const BLUE = '#4f5bff';
const GREY = '#737373';

function dateText(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function money(cents, currency = 'USD') {
  const value = Number(cents || 0) / 100;
  return `${value.toFixed(2)} ${currency}`;
}

// Order details: buyer or seller, summary, status steps, and (for the seller) mark as paid or cancel
export default function OrderDetails() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { orderId } = useRoute().params;
  const me = useAppStore((s) => s.user);
  const [order, setOrder] = useState(null);
  const [other, setOther] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api(`/v1/messages/orders/${orderId}`)
      .then((data) => {
        if (!alive) return;
        setOrder(data.order);
        const otherId = String(data.order.sellerId) === String(me?.id) ? data.order.buyerId : data.order.sellerId;
        return api(`/v1/messages/with/${otherId}/info`).then((info) => { if (alive) setOther(info.user); });
      })
      .catch((e) => { if (alive) setError(e.message || 'Could not load this order'); });
    return () => { alive = false; };
  }, [orderId, me?.id]);

  const isSeller = order && String(order.sellerId) === String(me?.id);

  async function act(path, done) {
    setBusy(true);
    try {
      const data = await api(`/v1/messages/orders/${orderId}/${path}`, { method: 'POST', body: {} });
      setOrder(data.order);
      Alert.alert('Order', done);
    } catch (e) {
      logError(e);
      Alert.alert('Order', e.message || 'Could not update the order');
    } finally {
      setBusy(false);
    }
  }

  function confirmCancel() {
    Alert.alert('Cancel order?', 'The buyer will see that this order was cancelled.', [
      { text: 'Keep order', style: 'cancel' },
      { text: 'Cancel order', style: 'destructive', onPress: () => act('cancel', 'Order cancelled') },
    ]);
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back" hitSlop={8}><ArrowLeft size={26} color={colors.text} /></Pressable>
        <Text style={styles.title}>Order Details</Text>
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {order && (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.person}>
            {other && <Avatar user={other} size={64} />}
            <View style={styles.personText}>
              <Text style={styles.personName}>{other ? (other.displayName || other.username) : ''}</Text>
              <Text style={styles.muted}>{isSeller ? 'Buyer' : 'Seller'}</Text>
            </View>
          </View>

          <View style={styles.block}>
            <Text style={styles.heading}>Order Summary</Text>
            <Text style={styles.line}>Total: {money(order.amountCents, order.currency)}</Text>
            <Text style={styles.line}>Order Number: {order.id}</Text>
            {!!order.description && <Text style={styles.line}>Description: {order.description}</Text>}
          </View>

          <View style={styles.block}>
            <Text style={styles.heading}>Status</Text>
            <View style={styles.step}>
              <View style={[styles.dot, styles.dotDone]}><Text style={styles.dotText}>✓</Text></View>
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>Order created</Text>
                <Text style={styles.muted}>{dateText(order.createdAt)}</Text>
              </View>
            </View>

            {order.status === 'created' && (
              <View style={styles.step}>
                <View style={styles.dot} />
                <View style={styles.stepText}>
                  <Text style={styles.stepTitle}>Waiting for payment</Text>
                  {isSeller ? (
                    <>
                      <Pressable style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={() => act('paid', 'Order marked as paid')} accessibilityLabel="Mark as paid">
                        <Text style={styles.primaryText}>Mark as paid</Text>
                      </Pressable>
                      <Text style={styles.muted}>Mark the order as paid to let the buyer know you have received payment.</Text>
                    </>
                  ) : (
                    <Text style={styles.muted}>The seller will mark this order as paid once payment is received.</Text>
                  )}
                </View>
              </View>
            )}

            {order.status === 'paid' && (
              <View style={styles.step}>
                <View style={[styles.dot, styles.dotDone]}><Text style={styles.dotText}>✓</Text></View>
                <View style={styles.stepText}>
                  <Text style={styles.stepTitle}>Paid</Text>
                  <Text style={styles.muted}>{dateText(order.paidAt)}</Text>
                </View>
              </View>
            )}

            {order.status === 'cancelled' && (
              <View style={styles.step}>
                <View style={[styles.dot, styles.dotCancelled]}><Text style={styles.dotText}>×</Text></View>
                <View style={styles.stepText}>
                  <Text style={styles.stepTitle}>Cancelled</Text>
                  <Text style={styles.muted}>{dateText(order.cancelledAt)}</Text>
                </View>
              </View>
            )}
          </View>

          {isSeller && order.status === 'created' && (
            <Pressable style={styles.cancel} disabled={busy} onPress={confirmCancel} accessibilityLabel="Cancel order">
              <Text style={styles.cancelText}>Cancel order</Text>
            </Pressable>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, height: 52 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  error: { color: '#ed4956', paddingHorizontal: 20, paddingTop: 12 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 24, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#efefef' },
  personText: { flex: 1 },
  personName: { fontSize: 18, fontWeight: '600', color: colors.text },
  muted: { color: GREY, fontSize: 14, lineHeight: 19, marginTop: 2 },
  block: { paddingVertical: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#efefef' },
  heading: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 10 },
  line: { color: GREY, fontSize: 15, marginVertical: 3 },
  step: { flexDirection: 'row', gap: 14, marginTop: 14 },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#c7c7c7', alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: '#31a24c', borderColor: '#31a24c' },
  dotCancelled: { backgroundColor: '#ed4956', borderColor: '#ed4956' },
  dotText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  stepText: { flex: 1 },
  stepTitle: { fontSize: 17, color: colors.text, fontWeight: '500' },
  primary: { height: 48, borderRadius: 10, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  cancel: { marginTop: 28, paddingVertical: 14 },
  cancelText: { color: '#ed4956', fontSize: 17 },
});
