import { Game } from './game/Game';

const app = document.getElementById('app')!;
const game = new Game(app);
document.getElementById('loading')?.remove();
(window as unknown as { game: Game }).game = game;
game.start();
