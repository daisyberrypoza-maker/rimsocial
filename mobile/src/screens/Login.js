import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { api } from '../api';
import { useAppStore } from '../store';
import { loadAccount } from '../lib/account';
import { colors } from '../theme';

const REGISTER_STEPS = [
  { key: 'displayName', title: 'What should we call you?', subtitle: 'Start with the name your friends will see.' },
  { key: 'email', title: 'What’s your email?', subtitle: 'Use an email address you can access.' },
  { key: 'username', title: 'Choose your username', subtitle: 'Make it easy for friends to find you.' },
  { key: 'password', title: 'Create a password', subtitle: 'Use at least 8 characters to keep your account secure.' },
  { key: 'country', title: 'Where are you from?', subtitle: 'Choose your country to finish setting up your account.' },
];

// Log in, or sign up in steps. Every sign-in lands on Stories, the default screen.
export default function Login() {
  const setSession = useAppStore((s) => s.setSession);
  const [mode, setMode] = useState('login');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ username: '', password: '', email: '', displayName: '', country: 'NG' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  async function finish(data) {
    setSession(data.token, data.user);
    await loadAccount().catch(() => {});
  }

  async function submit() {
    setError(''); setBusy(true);
    try {
      const payload = mode === 'register'
        ? { username: form.username.trim(), password: form.password, email: form.email.trim(), displayName: form.displayName.trim(), country: form.country.trim().toUpperCase() }
        : { username: form.username.trim(), password: form.password };
      await finish(await api(`/v1/auth/${mode}`, { method: 'POST', body: payload }));
    } catch (err) {
      setError(err.message || 'We could not sign you in. Please try again.');
    } finally { setBusy(false); }
  }

  function next() {
    if (mode === 'register' && step < REGISTER_STEPS.length - 1) { setStep((s) => s + 1); setError(''); return; }
    submit();
  }

  const current = REGISTER_STEPS[step];
  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>RimSocial</Text>
        {mode === 'login' ? (
          <>
            <Text style={styles.eyebrow}>YOUR PEOPLE. YOUR MOMENTS.</Text>
            <Text style={styles.h1}>Welcome back</Text>
            <View style={styles.tabs}>
              <Text style={[styles.tab, styles.tabOn]}>Log in</Text>
              <Pressable onPress={() => { setMode('register'); setStep(0); setError(''); }}><Text style={styles.tab}>Sign up</Text></Pressable>
            </View>
            <Field label="Username" value={form.username} onChangeText={set('username')} autoCapitalize="none" />
            <Field label="Password" value={form.password} onChangeText={set('password')} secureTextEntry />
            <Btn label={busy ? 'Please wait…' : 'Log in'} onPress={submit} disabled={busy} />
          </>
        ) : (
          <>
            <Pressable onPress={() => (step === 0 ? setMode('login') : setStep((s) => s - 1))}><Text style={styles.link}>{step === 0 ? 'Back to log in' : 'Back'}</Text></Pressable>
            <Text style={styles.h1}>{current.title}</Text>
            <Text style={styles.sub}>{current.subtitle}</Text>
            <Field
              label={current.key === 'country' ? 'Country code (e.g. NG)' : current.key}
              value={form[current.key]}
              onChangeText={set(current.key)}
              secureTextEntry={current.key === 'password'}
              autoCapitalize={current.key === 'username' || current.key === 'country' ? 'characters' : 'none'}
              keyboardType={current.key === 'email' ? 'email-address' : 'default'}
            />
            <Btn label={step < REGISTER_STEPS.length - 1 ? 'Next' : busy ? 'Please wait…' : 'Create account'} onPress={next} disabled={busy} />
          </>
        )}
        {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={colors.muted} {...props} />
    </View>
  );
}

function Btn({ label, onPress, disabled }) {
  return <Pressable style={[styles.btn, disabled && { opacity: 0.6 }]} onPress={onPress} disabled={disabled}><Text style={styles.btnText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  wrap: { padding: 24, paddingTop: 80, gap: 12 },
  brand: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 12 },
  eyebrow: { fontSize: 12, color: colors.muted, letterSpacing: 1 },
  h1: { fontSize: 28, fontWeight: '800', color: colors.text },
  sub: { fontSize: 15, color: colors.muted },
  tabs: { flexDirection: 'row', gap: 20, marginVertical: 8 },
  tab: { fontSize: 16, color: colors.muted, fontWeight: '600' },
  tabOn: { color: colors.text },
  link: { color: colors.text, fontWeight: '600', marginBottom: 8 },
  field: { gap: 6 },
  label: { fontSize: 13, color: colors.muted, textTransform: 'capitalize' },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text },
  btn: { marginTop: 8, backgroundColor: colors.text, borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { color: colors.heart, marginTop: 8 },
});
