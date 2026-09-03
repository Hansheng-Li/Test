import { Game } from './game/Game';

const app = document.getElementById('app')!;
const game = new Game(app);
(window as unknown as { game: Game }).game = game;
game.start();
