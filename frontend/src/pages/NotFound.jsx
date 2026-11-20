import { Link } from 'react-router-dom';
import './NotFound.css';

export default function NotFound() {
  return <main className="not-found">
    <h1>Page not found</h1>
    <p>The page you were looking for does not exist or may have moved.</p>
    <Link className="not-found-home" to="/">Go to home</Link>
  </main>;
}
