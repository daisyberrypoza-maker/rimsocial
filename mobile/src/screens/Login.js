import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Modal, FlatList } from 'react-native';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react-native';
import { api } from '../api';
import { useAppStore } from '../store';
import { loadAccount } from '../lib/account';
import { logError } from '../lib/toast';
import { colors } from '../theme';

// Same copy and steps as the web page. Sign-up asks one thing per screen.
const REGISTER_STEPS = [
  { key: 'displayName', title: 'What should we call you?', subtitle: 'Start with the name your friends will see.', label: 'Display name', placeholder: 'Your name' },
  { key: 'email', title: 'What’s your email?', subtitle: 'Use an email address you can access.', label: 'Email address', placeholder: 'you@example.com' },
  { key: 'username', title: 'Choose your username', subtitle: 'Make it easy for friends to find you.', label: 'Username', placeholder: 'Choose a username' },
  { key: 'password', title: 'Create a password', subtitle: 'Use at least 8 characters to keep your account secure.', label: 'Password', placeholder: 'At least 8 characters' },
  { key: 'country', title: 'Where are you from?', subtitle: 'Choose your country to finish setting up your account.', label: 'Country', placeholder: '' },
];

const COUNTRY_CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(' ');

// Country names in the phone's language, sorted like the web list (falls back to the code)
const COUNTRIES = (() => {
  let names = null;
  try { names = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { names = null; }
  return COUNTRY_CODES
    .map((code) => ({ code, name: (names && names.of(code)) || code }))
    .sort((a, b) => a.name.localeCompare(b.name));
})();

export default function Login() {
  const setSession = useAppStore((s) => s.setSession);
  const [mode, setMode] = useState('login');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ username: '', password: '', email: '', displayName: '', country: 'NG' });
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (value) => { setError(''); setForm((f) => ({ ...f, [key]: value })); };

  async function finish(data) {
    setSession(data.token, data.user);
    await loadAccount().catch(() => {});
  }

  async function submit() {
    setBusy(true);
    try {
      const payload = mode === 'register'
        ? { username: form.username.trim(), password: form.password, email: form.email.trim(), displayName: form.displayName.trim(), country: form.country.trim().toUpperCase() }
        : { username: form.username.trim(), password: form.password };
      await finish(await api(`/v1/auth/${mode}`, { method: 'POST', body: payload }));
    } catch (err) {
      setError(err?.message || 'We could not complete that request. Please try again.');
      logError(err);
    } finally { setBusy(false); }
  }

  // A step can only continue when its field is filled in the same way the web form requires
  function stepValid() {
    const key = REGISTER_STEPS[step].key;
    const value = String(form[key] || '').trim();
    if (!value) return false;
    if (key === 'username') return value.length >= 3 && value.length <= 32 && /^[A-Za-z0-9._]+$/.test(value);
    if (key === 'password') return form.password.length >= 8;
    if (key === 'email') return /^[^\s@]+@[^\s@]+\\.[^\s@]+$/.test(value);
    return true;
  }

  function next() {
    if (busy) return;
    if (mode === 'register' && step < REGISTER_STEPS.length - 1) {
      if (stepValid()) setStep((s) => s + 1);
      return;
    }
    if (mode === 'login' && (form.username.trim().length < 3 || form.password.length < 8)) return;
    submit();
  }

  const current = REGISTER_STEPS[step];
  const loginReady = form.username.trim().length >= 3 && form.password.length >= 8;
  const selectedCountry = COUNTRIES.find((c) => c.code === form.country);

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>RimSocial</Text>
        {mode === 'login' ? (
          <>
            <Text style={styles.eyebrow}>YOUR PEOPLE. YOUR MOMENTS.</Text>
            <Text style={styles.h1}>Welcome back</Text>
            <Text style={styles.sub}>Log in to see what your friends are sharing.</Text>
            <View style={styles.modeSwitch} accessibilityRole="tablist">
              <View style={styles.modeOn}><Text style={styles.modeOnText}>Log in</Text></View>
              <Pressable style={styles.modeOff} onPress={() => { setMode('register'); setStep(0); }} accessibilityRole="tab"><Text style={styles.modeOffText}>Sign up</Text></Pressable>
            </View>
            <Field label="Username" value={form.username} onChangeText={set('username')} autoCapitalize="none" autoComplete="username" placeholder="Your username" maxLength={32} />
            <PasswordField value={form.password} onChangeText={set('password')} placeholder="Your password" visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
            <Btn label="Log in" onPress={next} disabled={busy || !loginReady} />
          </>
        ) : (
          <>
            <View style={styles.stepMeta}>
              <Pressable onPress={() => (step === 0 ? setMode('login') : setStep((s) => s - 1))} accessibilityLabel="Go back" hitSlop={10}><ArrowLeft size={28} color={colors.text} /></Pressable>
              <Pressable onPress={() => { setMode('login'); setStep(0); }} accessibilityLabel="Log in"><Text style={styles.cancel}>Log in</Text></Pressable>
            </View>
            <View style={styles.progress}><View style={[styles.progressFill, { width: `${((step + 1) / REGISTER_STEPS.length) * 100}%` }]} /></View>
            <Text style={styles.eyebrow}>LET’S GET YOU SET UP</Text>
            <Text style={styles.h1}>{current.title}</Text>
            <Text style={styles.sub}>{current.subtitle}</Text>
            {current.key === 'country' ? (
              <View style={styles.field}>
                <Text style={styles.label}>{current.label}</Text>
                <Pressable style={styles.input} onPress={() => setCountryOpen(true)} accessibilityLabel="Choose your country">
                  <Text style={styles.inputText}>{selectedCountry ? selectedCountry.name : form.country}</Text>
                </Pressable>
              </View>
            ) : current.key === 'password' ? (
              <PasswordField label={current.label} value={form.password} onChangeText={set('password')} placeholder={current.placeholder} visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
            ) : (
              <Field
                label={current.label}
                value={form[current.key]}
                onChangeText={set(current.key)}
                placeholder={current.placeholder}
                autoCapitalize={current.key === 'displayName' ? 'words' : 'none'}
                keyboardType={current.key === 'email' ? 'email-address' : 'default'}
                maxLength={current.key === 'displayName' ? 64 : current.key === 'username' ? 32 : undefined}
              />
            )}
            <Btn label={step < REGISTER_STEPS.length - 1 ? 'Continue →' : 'Create account →'} onPress={next} disabled={busy || !stepValid()} />
            <Text style={styles.footnote}>You can go back at any time to change your details.</Text>
          </>
        )}
        {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
        <Text style={styles.terms}>By continuing, you agree to RimSocial’s Terms and Privacy Policy.</Text>
        <Text style={styles.footer}>A little more fun, a little more you. ●</Text>
      </ScrollView>

      <Modal visible={countryOpen} animationType="slide" transparent onRequestClose={() => setCountryOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetTop}>
              <Text style={styles.sheetTitle}>Country</Text>
              <Pressable onPress={() => setCountryOpen(false)} accessibilityLabel="Done"><Text style={styles.done}>Done</Text></Pressable>
            </View>
            <FlatList
              data={COUNTRIES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <Pressable style={styles.countryRow} onPress={() => { set('country')(item.code); setCountryOpen(false); }}>
                  <Text style={[styles.countryText, item.code === form.country && styles.countryOn]}>{item.name}</Text>
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...props }) {
  return (
    <View style={styles.field}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <TextInput style={styles.input} placeholderTextColor={colors.muted} {...props} />
    </View>
  );
}

function PasswordField({ label = 'Password', visible, onToggle, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.passwordRow}>
        <TextInput style={[styles.input, styles.passwordInput]} placeholderTextColor={colors.muted} secureTextEntry={!visible} autoCapitalize="none" {...props} />
        <Pressable style={styles.eye} onPress={onToggle} accessibilityLabel={visible ? 'Hide password' : 'Show password'} hitSlop={8}>
          {visible ? <EyeOff size={22} color={colors.muted} /> : <Eye size={22} color={colors.muted} />}
        </Pressable>
      </View>
    </View>
  );
}

function Btn({ label, onPress, disabled }) {
  return <Pressable style={[styles.btn, disabled && styles.btnDim]} onPress={onPress} disabled={disabled} accessibilityRole="button"><Text style={styles.btnText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  wrap: { padding: 24, paddingTop: 72, gap: 12 },
  brand: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 12 },
  eyebrow: { fontSize: 11, color: colors.muted, letterSpacing: 1.5, fontWeight: '700' },
  h1: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  sub: { fontSize: 15, color: colors.muted, lineHeight: 22 },
  modeSwitch: { flexDirection: 'row', backgroundColor: '#f1f1f1', borderRadius: 14, padding: 4, marginVertical: 10 },
  modeOn: { flex: 1, backgroundColor: colors.text, borderRadius: 11, paddingVertical: 10, alignItems: 'center' },
  modeOnText: { color: '#fff', fontWeight: '700' },
  modeOff: { flex: 1, borderRadius: 11, paddingVertical: 10, alignItems: 'center' },
  modeOffText: { color: '#444', fontWeight: '600' },
  stepMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  cancel: { fontSize: 15, fontWeight: '600', color: colors.text },
  progress: { height: 4, borderRadius: 99, backgroundColor: '#ededed', overflow: 'hidden', marginBottom: 20 },
  progressFill: { height: 4, backgroundColor: colors.text },
  field: { gap: 6 },
  label: { fontSize: 13, color: colors.text, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#d8d8d8', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: colors.text, backgroundColor: colors.bg, justifyContent: 'center' },
  inputText: { fontSize: 16, color: colors.text },
  passwordRow: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 52 },
  eye: { position: 'absolute', right: 12, height: '100%', justifyContent: 'center' },
  btn: { marginTop: 8, backgroundColor: colors.text, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  btnDim: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  footnote: { marginTop: 12, color: '#888', fontSize: 12, textAlign: 'center' },
  error: { color: '#d93025', fontSize: 13, lineHeight: 19, marginTop: 8 },
  terms: { marginTop: 18, textAlign: 'center', fontSize: 11, lineHeight: 16, color: '#888' },
  footer: { marginTop: 10, textAlign: 'center', fontSize: 12, fontWeight: '700', color: colors.text },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { maxHeight: '75%', backgroundColor: colors.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24 },
  sheetTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  done: { fontSize: 16, fontWeight: '600', color: colors.text },
  countryRow: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.line },
  countryText: { fontSize: 16, color: colors.text },
  countryOn: { fontWeight: '700' },
});
