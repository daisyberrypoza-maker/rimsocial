import React from 'react';
import { Link } from 'react-router-dom';

export default function Terms() {
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '32px 20px', color: 'var(--text, #171717)', lineHeight: 1.65 }}>
      <p><Link to="/login">Back to RimSocial</Link></p>
      <h1>Terms of Service and End User Licence Agreement</h1>
      <p>Effective date: 26 November 2026</p>
      <p>These Terms govern your access to and use of RimSocial, including posts, stories, videos, live features, direct messages and other user-generated content. By creating an account or using the service, you agree to these Terms and our Privacy Policy.</p>
      <h2>Eligibility and account security</h2>
      <p>You must meet the minimum age required by applicable law. Keep your login credentials secure, provide accurate account information and notify us if you suspect unauthorised access. You are responsible for activity carried out through your account.</p>
      <h2>User content and licence</h2>
      <p>You retain ownership of content you create. You grant RimSocial a non-exclusive, worldwide, royalty-free licence to host, store, reproduce, process, display and distribute your content only as reasonably necessary to operate, secure and improve the service and deliver the features you choose. You confirm that you own or have permission to use all content you upload, including music, images and video.</p>
      <h2>Prohibited conduct</h2>
      <p>Do not upload or share unlawful, infringing, exploitative, threatening, hateful, harassing, deceptive or otherwise harmful content. Do not impersonate others, stalk or intimidate users, distribute malware, commit fraud, spam users, evade enforcement, or violate another person's privacy or intellectual-property rights.</p>
      <h2>Safety, reporting and enforcement</h2>
      <p>Use in-app reporting tools to report content, accounts or messages that violate these Terms. We may investigate reports, remove or restrict content, limit features, preserve information where legally required, and suspend or terminate accounts to protect users or comply with law. We do not guarantee that every user-submitted item is reviewed before it appears.</p>
      <h2>Third-party services and music</h2>
      <p>Some features may rely on third-party services. Their terms may also apply. You must have the necessary rights and permissions for any music or other third-party material you use. Availability and playback may depend on the rights holder or provider.</p>
      <h2>Availability and termination</h2>
      <p>We may change, suspend or discontinue features for operational, security or legal reasons. You may stop using RimSocial at any time. Account deletion and data handling are subject to the Privacy Policy and applicable law.</p>
      <h2>Disclaimers and liability</h2>
      <p>To the extent permitted by applicable law, the service is provided on an “as available” basis without warranties not expressly stated. RimSocial is not liable for indirect, incidental, special or consequential losses except where such limitation is prohibited by law. Nothing in these Terms limits rights that cannot legally be excluded.</p>
      <h2>Changes and contact</h2>
      <p>We may update these Terms. Material changes will be communicated through the service where appropriate. Continued use after the effective date of an update constitutes acceptance where permitted by law. Contact RimSocial support through the in-app support channel for questions or concerns.</p>
    </main>
  );
}
