import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import { useAppStore } from '../store.js';
import { goBack } from '../lib/goBack.js';
import { formatMoney } from '../lib/money.js';
import { toast, logError } from '../toast.js';
import './OrderDetails.css';

function dateText(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function OrderDetails() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const me = useAppStore((st) => st.user);
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
      toast(done);
    } catch (e) {
      logError(e);
      toast(e.message || 'Could not update the order');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="od-page">
      <header className="od-top">
        <button type="button" className="od-back" onClick={() => goBack(navigate, '/chat')} aria-label="Back">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
        </button>
        <h1>Order Details</h1>
      </header>

      {error && <p className="od-error" role="alert">{error}</p>}

      {order && (
        <>
          <section className="od-person">
            {other && <Avatar user={other} size={64} />}
            <div>
              <strong>{other ? (other.displayName || other.username) : ''}</strong>
              <span>{isSeller ? 'Buyer' : 'Seller'}</span>
            </div>
          </section>

          <section className="od-block">
            <h2>Order Summary</h2>
            <p>Total: {formatMoney(order.amountCents, order.currency)}</p>
            <p>Order Number: {order.id}</p>
            {order.description && <p>Description: {order.description}</p>}
          </section>

          <section className="od-block">
            <h2>Status</h2>
            <ol className="od-steps">
              <li className="done">
                <span className="od-dot" aria-hidden="true">✓</span>
                <div>
                  <strong>Order created</strong>
                  <small>{dateText(order.createdAt)}</small>
                </div>
              </li>
              {order.status === 'created' && (
                <li>
                  <span className="od-dot" aria-hidden="true" />
                  <div>
                    <strong>Waiting for payment</strong>
                    {isSeller ? (
                      <>
                        <button type="button" className="od-primary" disabled={busy} onClick={() => act('paid', 'Order marked as paid')}>Mark as paid</button>
                        <small>Mark the order as paid to let the buyer know you have received payment.</small>
                      </>
                    ) : (
                      <small>The seller will mark this order as paid once payment is received.</small>
                    )}
                  </div>
                </li>
              )}
              {order.status === 'paid' && (
                <li className="done">
                  <span className="od-dot" aria-hidden="true">✓</span>
                  <div>
                    <strong>Paid</strong>
                    <small>{dateText(order.paidAt)}</small>
                  </div>
                </li>
              )}
              {order.status === 'cancelled' && (
                <li className="cancelled">
                  <span className="od-dot" aria-hidden="true">×</span>
                  <div>
                    <strong>Cancelled</strong>
                    <small>{dateText(order.cancelledAt)}</small>
                  </div>
                </li>
              )}
            </ol>
          </section>

          {isSeller && order.status === 'created' && (
            <button type="button" className="od-cancel" disabled={busy} onClick={() => act('cancel', 'Order cancelled')}>Cancel order</button>
          )}
        </>
      )}
    </main>
  );
}
