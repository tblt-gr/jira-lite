import { Controller } from '@hotwired/stimulus';
import {
    readFavoriteBoards,
    toggleFavoriteBoard,
    updateFavoriteButton
} from '../favorites.js';

export default class extends Controller {
    connect() {
        this.items = Array.from(
            this.element.querySelectorAll('.home-board-item')
        );
        this.handleClick = event => {
            const button = event.target.closest('.favorite-button');

            if (!button) {
                return;
            }

            event.preventDefault();
            toggleFavoriteBoard(button.dataset.boardId);
            this.sync();
        };

        this.element.addEventListener('click', this.handleClick);
        this.sync();
    }

    disconnect() {
        this.element.removeEventListener('click', this.handleClick);
    }

    sync() {
        const favorites = readFavoriteBoards();

        this.items.forEach(item => {
            const active = favorites.has(item.dataset.boardId);
            const button = item.querySelector('.favorite-button');

            item.classList.toggle('is-favorite', active);

            if (button) {
                updateFavoriteButton(button, active, {
                    add: button.dataset.labelAdd,
                    remove: button.dataset.labelRemove
                });
            }
        });

    }
}
