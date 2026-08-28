import { createImageViewer } from './image-viewer.js';
import { createAttachmentRenderer } from './dialog/attachments.js';
import { createIssueFields } from './dialog/issue-fields.js';
import { renderRichText } from './dialog/rich-text.js';

// This facade coordinates issue sections; each dialog module owns one rendering responsibility.
export function createIssueView(context) {
    const { root, state, trans } = context;
    const listenerOptions = { signal: context.signal };
    const imageViewer = createImageViewer({ root, signal: context.signal });
    const fields = createIssueFields({
        root,
        state,
        openIssue: context.openIssue,
        signal: context.signal,
        trans
    });
    const renderIssueAttachments = createAttachmentRenderer({
        root,
        imageViewer,
        signal: context.signal,
        trans
    });

    function renderIssueDescription(description) {
        renderRichText(
            root.querySelector('#issue-description'),
            description,
            trans('issue.no_description')
        );
    }

    function renderIssueLinks(issue) {
        const section = root.querySelector('#issue-links');
        const container = root.querySelector('#issue-links-list');
        const links = Array.isArray(issue.fields?.issuelinks)
            ? issue.fields.issuelinks
            : [];

        container.replaceChildren();

        links.forEach(issueLink => {
            const linkedIssue = issueLink.outwardIssue || issueLink.inwardIssue;

            if (!linkedIssue?.key) {
                return;
            }

            const relation = issueLink.outwardIssue
                ? issueLink.type?.outward
                : issueLink.type?.inward;
            const item = document.createElement('button');
            const identity = document.createElement('span');
            const key = document.createElement('strong');
            const summary = document.createElement('span');
            const status = linkedIssue.fields?.status?.name;

            item.className = 'issue-link-card';
            item.type = 'button';
            item.setAttribute(
                'aria-label',
                trans('issue.open_modal', { key: linkedIssue.key })
            );
            item.addEventListener(
                'click',
                () => context.openIssue(linkedIssue.key),
                listenerOptions
            );
            identity.className = 'issue-link-identity';
            key.textContent = linkedIssue.key;
            summary.textContent = linkedIssue.fields?.summary
                || trans('issue.without_title');
            identity.append(key, summary);
            item.append(identity);

            if (relation || status) {
                const details = document.createElement('span');
                details.className = 'issue-link-details';

                if (relation) {
                    const relationLabel = document.createElement('span');
                    relationLabel.textContent = relation;
                    details.append(relationLabel);
                }

                if (status) {
                    const statusLabel = document.createElement('span');
                    statusLabel.className = 'issue-link-status';
                    statusLabel.textContent = status;
                    details.append(statusLabel);
                }

                item.append(details);
            }

            container.append(item);
        });

        section.hidden = container.childElementCount === 0;
    }

    return {
        ...fields,
        renderIssueAttachments,
        renderIssueDescription,
        renderIssueLinks,
        renderRichText
    };
}
