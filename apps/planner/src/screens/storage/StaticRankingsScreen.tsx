/**
 * The static rankings page with its storage controls (storage connectors spec
 * R7): the shared RankingsScreen (hosted renders it too, without these), with
 * "Save to…" and the sync status for the current rankings document, and "Open
 * from…". A refresh or "Use theirs" remounts the screen so it shows the file's
 * version; each saved edit re-reads the status.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack } from "@mui/material";
import { RANKINGS_FORMAT, rankingsFileName } from "@/lib/rankings-document";
import { docKeyOf } from "../../store/links";
import type { RankingsOps } from "../../store/rankings";
import type { LocalPlannerStore } from "../../store/types";
import { staticRoutes } from "../../routes";
import { RankingsScreen } from "../rankings/RankingsScreen";
import { DocumentStorageBar } from "./DocumentStorageBar";
import { OpenFromMenu } from "./OpenFromMenu";
import { useStorage } from "./StorageContext";

export function StaticRankingsScreen({ store }: { store: LocalPlannerStore }) {
    const storage = useStorage();
    const [current, setCurrent] = useState<{ id: string; fileName: string } | null>(null);
    const [mount, setMount] = useState(0);
    const [edits, setEdits] = useState(0);
    const remount = useCallback(() => setMount((value) => value + 1), []);

    useEffect(() => {
        let live = true;
        void store.listRankingsDocuments().then(async (listed) => {
            const first = listed.success ? listed.data[0] : undefined;
            if (!first || first.damaged) {
                if (live) setCurrent(null);
                return;
            }
            const record = await store.getRankingsDocument(first.id);
            if (live) setCurrent(record.success ? { id: first.id, fileName: rankingsFileName(record.data.document) } : null);
        });
        return () => {
            live = false;
        };
    }, [store, mount, edits]);

    // The screen's saves, observed: the status follows each edit. One identity per store, as the screen loads once per store.
    const observed = useMemo<RankingsOps>(
        () => ({
            ...store,
            saveRankings: async (doc) => {
                const result = await store.saveRankings(doc);
                if (result.success) setEdits((value) => value + 1);
                return result;
            },
            clearRankings: async () => {
                const result = await store.clearRankings();
                if (result.success) setEdits((value) => value + 1);
                return result;
            },
        }),
        [store],
    );

    return (
        <>
            {storage && (
                <Stack direction="row" spacing={1} sx={{ mb: 1, justifyContent: "flex-end", flexWrap: "wrap", rowGap: 1 }}>
                    <OpenFromMenu kind={RANKINGS_FORMAT} importHref={staticRoutes.rankingsImport()} onOpened={remount} />
                </Stack>
            )}
            {current && <DocumentStorageBar key={current.id} docKey={docKeyOf(RANKINGS_FORMAT, current.id)} kind={RANKINGS_FORMAT} fileName={current.fileName} onReplaced={remount} editVersion={edits} />}
            <RankingsScreen key={mount} store={observed} />
        </>
    );
}
