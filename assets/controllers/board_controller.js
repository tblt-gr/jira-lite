import { Controller } from '@hotwired/stimulus';
import { mountBoard } from '../board/app.js';

const REFRESH_INTERVAL = 30_000;

export default class extends Controller {
    static values = {
        boardId: Number
    };

    connect() {
        this.board = mountBoard(this.element, this.boardIdValue);
        this.refresh = () => this.board?.refresh();
        this.timer = window.setInterval(this.refresh, REFRESH_INTERVAL);
        document.addEventListener('visibilitychange', this.refresh);
    }

    disconnect() {
        window.clearInterval(this.timer);
        document.removeEventListener('visibilitychange', this.refresh);
        this.board?.destroy();
        this.board = null;
    }
}
