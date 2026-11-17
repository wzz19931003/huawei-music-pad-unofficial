import { createRoot } from 'react-dom/client';
import { DesktopLyrics } from './DesktopLyrics';
import './desktop-lyrics.css';

const root = document.getElementById('desktop-lyrics-root');
if (root) createRoot(root).render(<DesktopLyrics />);
