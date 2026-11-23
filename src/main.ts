import './styles.css';
import { App } from './ui/app';

const root = document.getElementById('ui')!;
const canvas = document.getElementById('game') as HTMLCanvasElement;
// Keep the native context menu available outside the playfield.
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
(window as unknown as { alchemy: App }).alchemy = new App(root, canvas);
