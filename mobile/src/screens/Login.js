import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Modal, FlatList } from 'react-native';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react-native';
import { SvgXml } from 'react-native-svg';
import { api } from '../api';
import { useAppStore } from '../store';
import { loadAccount } from '../lib/account';
import { logError } from '../lib/toast';

// Instagram-style screens. Sign-up asks one thing per screen, in the same order as the web page.
const BLUE = '#0064e0';
const LINE = '#dbdbdb';
const CONTROL_H = 50;
const RADIUS = 8;
// Same logo as the web app (frontend/public/icons/rimsocial.svg)
const LOGO_XML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="116" fill="#171717"/><path d="M116 368V144h112c77 0 126 35 126 98 0 45-25 74-68 87l80 39h-93l-67-34h-14v34zm76-95h36c34 0 51-10 51-31s-17-31-51-31h-36z" fill="#fff"/><circle cx="374" cy="362" r="44" fill="#6d7cff"/><circle cx="374" cy="362" r="14" fill="#fff"/></svg>`;

const REGISTER_STEPS = [
  { key: 'email', title: 'What’s your email?', hint: 'You’ll use this to log in and secure your account.', placeholder: 'Email address' },
  { key: 'displayName', title: 'What’s your name?', hint: 'Add the name people will see on your profile.', placeholder: 'Full name' },
  { key: 'username', title: 'Choose a username', hint: 'You can change it later.', placeholder: 'Username' },
  { key: 'password', title: 'Create a password', hint: 'Use at least 8 characters.', placeholder: 'Password' },
  { key: 'country', title: 'Where are you?', hint: 'This sets your country for payments and content.', placeholder: '' },
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
  const [notice, setNotice] = useState('');
  const set = (key) => (value) => { setError(''); setForm((f) => ({ ...f, [key]: value })); };

  async function finish(data) {
    setSession(data.token, data.user);
    await loadAccount().catch(() => {});
  }

  async function submit() {
    setBusy(true); setError(''); setNotice('');
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
    if (key === 'username') return value.length >= 3 && value.length <= 32 && /^[A-Za-z0-9_]+$/.test(value);
    if (key === 'password') return form.password.length >= 8;
    if (key === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    if (key === 'displayName') return value.length <= 64;
    return true;
  }

  function next() {
    if (busy) return;
    if (mode === 'register') {
      if (step < REGISTER_STEPS.length - 1) { if (stepValid()) setStep((s) => s + 1); return; }
      if (stepValid()) submit();
      return;
    }
    if (form.username.trim().length < 3 || form.password.length < 8) return;
    submit();
  }

  function back() {
    setError('');
    if (mode === 'register' && step > 0) setStep((s) => s - 1);
    else { setMode('login'); setStep(0); }
  }

  const current = REGISTER_STEPS[step];
  const loginReady = form.username.trim().length >= 3 && form.password.length >= 8;
  const selectedCountry = COUNTRIES.find((c) => c.code === form.country);

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topbar}>
        <Pressable onPress={back} accessibilityLabel="Back" hitSlop={12}><ArrowLeft size={26} color="#000" /></Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        {mode === 'login' ? (
          <>
            <View style={styles.logoWrap}><SvgXml xml={LOGO_XML} width={56} height={56} /></View>
            <TextInput
              style={styles.input}
              placeholder="Username or email"
              placeholderTextColor="#737373"
              value={form.username}
              onChangeText={set('username')}
              autoCapitalize="none"
              autoComplete="username"
              maxLength={254}
            />
            <PasswordInput value={form.password} onChangeText={set('password')} placeholder="Password" visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
            <Btn label={busy ? 'Logging in…' : 'Log in'} onPress={next} disabled={busy || !loginReady} />
            <Pressable onPress={() => setNotice('Password reset is not set up yet. Please contact RimSocial support.')} style={styles.linkWrap}>
              <Text style={styles.link}>Forgot password?</Text>
            </Pressable>
            {!!notice && <Text style={styles.notice}>{notice}</Text>}
            <Pressable style={styles.outline} onPress={() => { setMode('register'); setStep(0); setError(''); }} accessibilityRole="button">
              <Text style={styles.outlineText}>Create new account</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.stepTitle}>{current.title}</Text>
            <Text style={styles.stepHint}>{current.hint}</Text>
            {current.key === 'country' ? (
              <Pressable style={styles.input} onPress={() => setCountryOpen(true)} accessibilityLabel="Choose your country">
                <Text style={styles.inputText}>{selectedCountry ? selectedCountry.name : form.country}</Text>
              </Pressable>
            ) : current.key === 'password' ? (
              <PasswordInput value={form.password} onChangeText={set('password')} placeholder={current.placeholder} visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
            ) : (
              <TextInput
                style={styles.input}
                placeholder={current.placeholder}
                placeholderTextColor="#737373"
                value={form[current.key]}
                onChangeText={set(current.key)}
                autoCapitalize={current.key === 'displayName' ? 'words' : 'none'}
                autoComplete={current.key === 'email' ? 'email' : current.key === 'username' ? 'username' : 'name'}
                keyboardType={current.key === 'email' ? 'email-address' : 'default'}
                maxLength={current.key === 'displayName' ? 64 : current.key === 'username' ? 32 : undefined}
              />
            )}
            {current.key === 'password' && form.password.length > 0 && form.password.length < 8 && (
              <Text style={styles.hintSmall}>Password must be at least 8 characters</Text>
            )}
            <Btn label={step < REGISTER_STEPS.length - 1 ? 'Next' : busy ? 'Please wait…' : 'Sign up'} onPress={next} disabled={busy || !stepValid()} />
            {step === 0 && (
              <Pressable style={styles.grey} onPress={() => setNotice('Google sign-in is available on the web app.')} accessibilityRole="button">
                <Text style={styles.greyText}>Sign up with Google</Text>
              </Pressable>
            )}
            {step === REGISTER_STEPS.length - 1 && (
              <Text style={styles.terms}>By signing up, you agree to RimSocial’s Terms and Privacy Policy.</Text>
            )}
            {!!notice && <Text style={styles.notice}>{notice}</Text>}
            <Pressable onPress={() => { setMode('login'); setStep(0); setError(''); }} style={styles.linkWrap}>
              <Text style={styles.blueLink}>I already have an account</Text>
            </Pressable>
          </>
        )}
        {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.meta}>∞ Meta</Text>
      </View>

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

function PasswordInput({ visible, onToggle, ...props }) {
  return (
    <View style={styles.passwordRow}>
      <TextInput style={[styles.input, styles.passwordInput]} placeholderTextColor="#737373" secureTextEntry={!visible} autoCapitalize="none" {...props} />
      <Pressable style={styles.eye} onPress={onToggle} accessibilityLabel={visible ? 'Hide password' : 'Show password'} hitSlop={8}>
        {visible ? <EyeOff size={22} color="#000" /> : <Eye size={22} color="#000" />}
      </Pressable>
    </View>
  );
}

function Btn({ label, onPress, disabled }) {
  return <Pressable style={[styles.btn, disabled && styles.btnDim]} onPress={onPress} disabled={disabled} accessibilityRole="button"><Text style={styles.btnText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  topbar: { height: 56, justifyContent: 'center', paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? 12 : 0 },
  wrap: { paddingHorizontal: 24, paddingTop: 0, paddingBottom: 24, gap: 12 },
  logoWrap: { alignItems: 'center', marginTop: 24, marginBottom: 40 },
  stepTitle: { fontSize: 26, fontWeight: '700', color: '#000', letterSpacing: -0.3, marginTop: 8, textAlign: 'left' },
  stepHint: { fontSize: 15, color: '#262626', lineHeight: 22, marginBottom: 12, textAlign: 'left' },
  input: { height: CONTROL_H, borderWidth: 1, borderColor: LINE, borderRadius: RADIUS, paddingHorizontal: 14, fontSize: 16, color: '#000', backgroundColor: '#fff', justifyContent: 'center' },
  inputText: { fontSize: 16, color: '#000' },
  passwordRow: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 64 },
  eye: { position: 'absolute', right: 14, height: '100%', justifyContent: 'center' },
  btn: { height: CONTROL_H, marginTop: 8, backgroundColor: BLUE, borderRadius: RADIUS, alignItems: 'center', justifyContent: 'center' },
  btnDim: { opacity: 0.4 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  linkWrap: { alignItems: 'center', paddingVertical: 10 },
  link: { fontSize: 15, fontWeight: '600', color: '#000' },
  blueLink: { fontSize: 15, fontWeight: '600', color: BLUE, marginTop: 16 },
  outline: { height: CONTROL_H, marginTop: 12, borderWidth: 1, borderColor: BLUE, borderRadius: RADIUS, alignItems: 'center', justifyContent: 'center' },
  outlineText: { color: BLUE, fontWeight: '600', fontSize: 15 },
  grey: { height: CONTROL_H, marginTop: 10, backgroundColor: '#f1f2f4', borderRadius: RADIUS, alignItems: 'center', justifyContent: 'center' },
  greyText: { color: '#000', fontWeight: '600', fontSize: 15 },
  hintSmall: { fontSize: 13, color: '#737373', marginLeft: 4 },
  terms: { fontSize: 13, color: '#737373', lineHeight: 19, marginTop: 8 },
  notice: { fontSize: 13, color: '#4b4200', backgroundColor: '#fff9c2', padding: 12, borderRadius: 12, lineHeight: 19 },
  error: { color: '#c5223b', fontSize: 14, lineHeight: 20, marginTop: 8, backgroundColor: '#fff0f1', padding: 12, borderRadius: 12 },
  footer: { alignItems: 'center', paddingBottom: 24 },
  meta: { fontSize: 20, fontWeight: '700', color: '#000' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { maxHeight: '75%', backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24 },
  sheetTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#000' },
  done: { fontSize: 16, fontWeight: '600', color: BLUE },
  countryRow: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  countryText: { fontSize: 16, color: '#000' },
  countryOn: { fontWeight: '700' },
});
