import {
    WITHOUT_VERSION_ID,
    availableColumns,
    availableIssueTypes,
    availableVersions,
    statusColumnMap
} from './board-model.js';
import { createMultiSelect } from './multi-select.js';

// This module owns non-epic filter catalogs, controls and URL synchronization.
export function createBoardFilters(context) {
    const { state, trans, signal } = context;

    function entries() {
        return [
            ['version', state.selectedVersionIds],
            ['type', state.selectedTypeIds],
            ['column', state.selectedColumnIds]
        ];
    }

    function writeToUrl(replace = false) {
        const url = new URL(window.location.href);

        entries().forEach(([param, selected]) => {
            url.searchParams.delete(param);
            selected.forEach(value => url.searchParams.append(param, value));
        });
        window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
    }

    function createFilterSelect(container, keys, selected) {
        return createMultiSelect({
            container,
            labels: {
                all: trans(keys.all),
                title: trans(keys.title),
                clear: trans('board.clear_all'),
                empty: trans('board.no_filter_value'),
                selected: count => trans('board.selected_values', { count })
            },
            selected,
            onChange: () => {
                writeToUrl();
                context.renderBoard(false);
            },
            signal
        });
    }

    const selects = [
        [
            createFilterSelect(
                context.versionFilter,
                { all: 'board.all_versions', title: 'board.versions_title' },
                state.selectedVersionIds
            ),
            'versions',
            state.selectedVersionIds
        ],
        [
            createFilterSelect(
                context.typeFilter,
                { all: 'board.all_types', title: 'board.types_title' },
                state.selectedTypeIds
            ),
            'types',
            state.selectedTypeIds
        ],
        [
            createFilterSelect(
                context.columnFilter,
                { all: 'board.all_columns', title: 'board.columns_title' },
                state.selectedColumnIds
            ),
            'columns',
            state.selectedColumnIds
        ]
    ];
    function catalogs() {
        const issues = state.data?.issues?.issues || [];
        const statusToColumn = statusColumnMap(
            state.data?.configuration?.columnConfig?.columns || []
        );
        const versions = availableVersions(state.data).map(version => ({
            ...version,
            count: issues.filter(issue =>
                (issue.fields?.fixVersions || []).some(candidate =>
                    String(candidate?.id ?? candidate?.name) === version.id
                )
            ).length
        }));
        const withoutVersion = issues.filter(issue =>
            !(issue.fields?.fixVersions || []).length
        ).length;
        if (withoutVersion) {
            versions.push({
                id: WITHOUT_VERSION_ID,
                name: trans('board.without_version'),
                count: withoutVersion
            });
        }

        return {
            versions,
            types: availableIssueTypes(state.data).map(type => ({
                ...type,
                count: issues.filter(issue => {
                    const issueType = issue.fields?.issuetype;
                    return String(issueType?.id ?? issueType?.name) === type.id;
                }).length
            })),
            columns: availableColumns(state.data).map(column => ({
                ...column,
                count: issues.filter(issue => {
                    const statusId = issue.fields?.status?.id;
                    return statusId !== undefined
                        && statusId !== null
                        && statusToColumn.get(String(statusId))?.name === column.name;
                }).length
            }))
        };
    }

    function restoreFromUrl() {
        const url = new URL(window.location.href);

        entries().forEach(([param, selected]) => {
            selected.clear();
            url.searchParams.getAll(param).filter(Boolean)
                .forEach(value => selected.add(value));
        });
    }

    function render() {
        const values = catalogs();
        let purged = false;

        selects.forEach(([select, catalogName, selected]) => {
            const options = values[catalogName];
            const allowed = new Set(options.map(option => option.id));

            Array.from(selected).forEach(id => {
                if (!allowed.has(id)) {
                    selected.delete(id);
                    purged = true;
                }
            });
            select.setOptions(options);
        });

        if (purged) {
            writeToUrl(true);
        }
    }

    return {
        hasActive: () => entries().some(([, selected]) => selected.size > 0),
        render,
        restoreFromUrl
    };
}
