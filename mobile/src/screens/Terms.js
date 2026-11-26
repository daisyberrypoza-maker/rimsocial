import React from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';

export default function Terms({ navigation }) {
  return (
    <View style={styles.page}>
      <View style={styles.header}><Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back"><ArrowLeft size={24} color="#FFFFFF" /></Pressable><Text style={styles.heading}>Terms of Service & EULA</Text></View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.date}>Effective date: 26 November 2026</Text>
        <Text style={styles.section}>Eligibility and account security</Text>
        <Text style={styles.body}>You must meet the minimum age required by applicable law. Keep your login credentials secure, provide accurate account information and notify us if you suspect unauthorised access. You are responsible for activity carried out through your account.</Text>
        <Text style={styles.section}>User content and licence</Text>
        <Text style={styles.body}>You retain ownership of content you create. You grant RimSocial a non-exclusive, worldwide, royalty-free licence to host, store, reproduce, process, display and distribute your content only as reasonably necessary to operate, secure and improve the service and deliver the features you choose. You confirm that you own or have permission to use all content you upload, including music, images and video.</Text>
        <Text style={styles.section}>Prohibited conduct</Text>
        <Text style={styles.body}>Do not upload or share unlawful, infringing, exploitative, threatening, hateful, harassing, deceptive or otherwise harmful content. Do not impersonate others, stalk or intimidate users, distribute malware, commit fraud, spam users, evade enforcement, or violate another person's privacy or intellectual-property rights.</Text>
        <Text style={styles.section}>Safety, reporting and enforcement</Text>
        <Text style={styles.body}>Use in-app reporting tools to report content, accounts or messages that violate these Terms. We may investigate reports, remove or restrict content, limit features, preserve information where legally required, and suspend or terminate accounts to protect users or comply with law. We do not guarantee that every user-submitted item is reviewed before it appears.</Text>
        <Text style={styles.section}>Third-party services and music</Text>
        <Text style={styles.body}>Some features may rely on third-party services. Their terms may also apply. You must have the necessary rights and permissions for any music or other third-party material you use. Availability and playback may depend on the rights holder or provider.</Text>
        <Text style={styles.section}>Availability and termination</Text>
        <Text style={styles.body}>We may change, suspend or discontinue features for operational, security or legal reasons. You may stop using RimSocial at any time. Account deletion and data handling are subject to the Privacy Policy and applicable law.</Text>
        <Text style={styles.section}>Disclaimers and liability</Text>
        <Text style={styles.body}>To the extent permitted by applicable law, the service is provided on an “as available” basis without warranties not expressly stated. RimSocial is not liable for indirect, incidental, special or consequential losses except where such limitation is prohibited by law. Nothing in these Terms limits rights that cannot legally be excluded.</Text>
        <Text style={styles.section}>Changes and contact</Text>
        <Text style={styles.body}>We may update these Terms. Material changes will be communicated through the service where appropriate. Continued use after the effective date of an update constitutes acceptance where permitted by law. Contact RimSocial support through the in-app support channel for questions or concerns.</Text>
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingTop: 52, paddingBottom: 16, backgroundColor: '#000000' },
  heading: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 48 },
  date: { color: '#666666', fontSize: 13, marginBottom: 20 },
  section: { color: '#111111', fontSize: 17, fontWeight: '700', marginTop: 18, marginBottom: 6 },
  body: { color: '#333333', fontSize: 14, lineHeight: 22 },
});
