import './styles.css';
import { App } from './ui/app';

const root = document.getElementById('ui')!;
const canvas = document.getElementById('game') as HTMLCanvasElement;
// Prevent iOS double-tap zoom / context menus interfering with drag controls.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());
(window as unknown as { alchemy: App }).alchemy = new App(root, canvas);
