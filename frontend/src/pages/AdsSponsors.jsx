import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { toast } from '../toast.js';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import { goBack } from '../lib/goBack.js';

export default function AdsSponsors() {
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    if (!user?.username) { setLoading(false); return; }
    try {
      const result = await api(`/v1/users/${encodeURIComponent(user.username)}/posts`);
      setPosts((result.items || []).filter((post) => post.isSponsored));
    } catch (error) { toast(error.message || 'Could not load sponsored posts.'); }
    finally { setLoading(false); setRefreshing(false); }
  }
  useEffect(() => { load(); }, [user?.username]);

  return <main className="page ads-sponsors-page">
    <header className="ads-sponsors-hero">
      <div className="ads-sponsors-backrow"><button className="icon-button" onClick={() => goBack(navigate)} aria-label="Go back"><Icon name="arrow-left" size={21} /></button><span>CREATOR TOOLS</span></div>
      <h1>Ads &amp; Sponsors</h1>
      <p>Manage sponsored posts and keep paid partnerships clearly disclosed to your audience.</p>
      <button className="ads-create-button" onClick={() => navigate('/upload')}><Icon name="plus" size={18} /> Create sponsored post</button>
    </header>
    <section className="ads-sponsors-content">
      <div className="ads-section-heading"><div><h2>Your sponsored posts</h2><p>Only posts you published with the paid partnership label appear here.</p></div><button className="ghost small" onClick={() => { setRefreshing(true); load(); }} disabled={refreshing}><Icon name="refresh" size={16} /> Refresh</button></div>
      {loading ? <div className="ads-empty"><p></p></div> :
        posts.length ? <div className="ads-post-list">{posts.map((post) => <article className="ads-post-card" key={post.id}>
          <div className="ads-post-avatar"><Avatar user={post.author || user} size={42} /></div>
          <div className="ads-post-main"><div className="ads-post-title"><strong>{post.sponsorName || 'Sponsored post'}</strong><span className="ads-label">Ad</span></div><p>{post.sponsorDescription || post.caption || 'Paid partnership'}</p><small>{post.sponsorCta || 'Shop Now'}{post.sponsorUrl ? ' · ' + post.sponsorUrl : ''}</small></div>
          <button className="icon-button" onClick={() => navigate(`/p/${post.id}`)} aria-label="View sponsored post"><Icon name="chevron" size={20} /></button>
        </article>)}</div> : <div className="ads-empty"><span className="ads-empty-icon"><Icon name="megaphone" size={28} /></span><h3>No sponsored posts yet</h3><p>When you publish a post with the paid partnership disclosure, it will appear here. RimSocial does not mark a post as sponsored without your explicit choice.</p><button onClick={() => navigate('/upload')}>Create a sponsored post</button></div>}
      <section className="ads-disclosure-card"><Icon name="shield-check" size={22} /><div><strong>Keep partnerships transparent</strong><p>Use the paid partnership option only when a brand or business has sponsored or paid for the promotion. Add an accurate sponsor name and destination, and make sure the link is trustworthy.</p></div></section>
    </section>
  </main>;
}
