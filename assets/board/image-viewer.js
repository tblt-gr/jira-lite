export function createImageViewer(context) {
    const { root, signal } = context;
    const listenerOptions = { signal };
    const dialog = root.querySelector('#image-viewer');

    if (!dialog) {
        return { open: () => {} };
    }

    const image = dialog.querySelector('#image-viewer-image');
    const title = dialog.querySelector('#image-viewer-title');
    const openLink = dialog.querySelector('#image-viewer-open');
    const unavailable = dialog.querySelector('#image-viewer-unavailable');
    let sources = [];
    let sourceIndex = 0;

    function close() {
        if (dialog.open) {
            dialog.close();
        }
    }

    function open({ sources: candidates, name, href }) {
        sources = Array.from(new Set((candidates || []).filter(Boolean)));

        if (sources.length === 0) {
            return;
        }

        sourceIndex = 0;
        title.textContent = name || '';
        image.alt = name || '';
        image.hidden = false;
        unavailable.hidden = true;
        image.src = sources[0];

        if (href) {
            openLink.href = href;
            openLink.hidden = false;
        } else {
            openLink.removeAttribute('href');
            openLink.hidden = true;
        }

        if (!dialog.open) {
            dialog.showModal();
        }
    }

    image.addEventListener('error', () => {
        sourceIndex += 1;

        if (sources[sourceIndex]) {
            image.src = sources[sourceIndex];
            return;
        }

        image.hidden = true;
        unavailable.hidden = false;
    }, listenerOptions);

    dialog.querySelector('#image-viewer-close')
        .addEventListener('click', close, listenerOptions);

    const body = dialog.querySelector('.image-viewer-body');

    dialog.addEventListener('click', event => {
        if (event.target === dialog || event.target === body) {
            close();
        }
    }, listenerOptions);

    dialog.addEventListener('close', () => {
        image.removeAttribute('src');
        sources = [];
    }, listenerOptions);

    return { open, close };
}
