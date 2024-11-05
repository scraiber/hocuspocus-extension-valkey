import type { AbstractType, YArrayEvent } from 'yjs';
import * as Y from 'yjs';
import { HocuspocusProvider, HocuspocusProviderConfiguration } from './HocuspocusProvider.js';
import { TiptapCollabProviderWebsocket } from './TiptapCollabProviderWebsocket.js';
import type { TCollabComment, TCollabThread, THistoryVersion } from './types.js';
export type TiptapCollabProviderConfiguration = Required<Pick<HocuspocusProviderConfiguration, 'name'>> & Partial<HocuspocusProviderConfiguration> & (Required<Pick<AdditionalTiptapCollabProviderConfiguration, 'websocketProvider'>> | Required<Pick<AdditionalTiptapCollabProviderConfiguration, 'appId'>> | Required<Pick<AdditionalTiptapCollabProviderConfiguration, 'baseUrl'>>) & Pick<AdditionalTiptapCollabProviderConfiguration, 'user'>;
export interface AdditionalTiptapCollabProviderConfiguration {
    /**
     * A Hocuspocus Cloud App ID, get one here: https://cloud.tiptap.dev
     */
    appId?: string;
    /**
     * If you are using the on-premise version of TiptapCollab, put your baseUrl here (e.g. https://collab.yourdomain.com)
     */
    baseUrl?: string;
    websocketProvider?: TiptapCollabProviderWebsocket;
    user?: string;
}
export declare class TiptapCollabProvider extends HocuspocusProvider {
    tiptapCollabConfigurationPrefix: string;
    userData?: Y.PermanentUserData;
    constructor(configuration: TiptapCollabProviderConfiguration);
    /**
     * note: this will only work if your server loaded @hocuspocus-pro/extension-history, or if you are on a Tiptap business plan.
     */
    createVersion(name?: string): void;
    /**
     * note: this will only work if your server loaded @hocuspocus-pro/extension-history, or if you are on a Tiptap business plan.
     */
    revertToVersion(targetVersion: number): void;
    /**
     * note: this will only work if your server loaded @hocuspocus-pro/extension-history, or if you are on a Tiptap business plan.
     *
     * The server will reply with a stateless message (THistoryVersionPreviewEvent)
     */
    previewVersion(targetVersion: number): void;
    /**
     * note: this will only work if your server loaded @hocuspocus-pro/extension-history, or if you are on a Tiptap business plan.
     */
    getVersions(): THistoryVersion[];
    watchVersions(callback: Parameters<AbstractType<YArrayEvent<THistoryVersion>>['observe']>[0]): void;
    unwatchVersions(callback: Parameters<AbstractType<YArrayEvent<THistoryVersion>>['unobserve']>[0]): void;
    isAutoVersioning(): boolean;
    enableAutoVersioning(): 1;
    disableAutoVersioning(): 0;
    private getYThreads;
    getThreads<Data, CommentData>(): TCollabThread<Data, CommentData>[];
    private getThreadIndex;
    getThread<Data, CommentData>(id: string): TCollabThread<Data, CommentData> | null;
    private getYThread;
    createThread(data: Omit<TCollabThread, 'id' | 'createdAt' | 'updatedAt' | 'comments'>): TCollabThread;
    updateThread(id: TCollabThread['id'], data: Partial<Pick<TCollabThread, 'data'> & {
        resolvedAt: TCollabThread['resolvedAt'] | null;
    }>): TCollabThread;
    deleteThread(id: TCollabThread['id']): void;
    getThreadComments(threadId: TCollabThread['id']): TCollabComment[] | null;
    getThreadComment(threadId: TCollabThread['id'], commentId: TCollabComment['id']): TCollabComment | null;
    addComment(threadId: TCollabThread['id'], data: Omit<TCollabComment, 'id' | 'updatedAt' | 'createdAt'>): TCollabThread;
    updateComment(threadId: TCollabThread['id'], commentId: TCollabComment['id'], data: Partial<Pick<TCollabComment, 'data' | 'content'>>): TCollabThread;
    deleteComment(threadId: TCollabThread['id'], commentId: TCollabComment['id']): TCollabThread | null | undefined;
    watchThreads(callback: () => void): void;
    unwatchThreads(callback: () => void): void;
}
