import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    TextInput,
    Alert,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import {
    DEFAULT_CLOUD_API_KEY,
    getCloudConfig,
    saveCloudConfig,
    pingCloudServer,
    submitCloudTask,
    listCloudTasks,
    cancelCloudTask,
    deleteCloudTask,
    downloadAndImportCloudTask,
} from '../utils/cloudSyncService';

const STATUS_META = {
    pending: { label: '排隊中', color: '#F59E0B' },
    processing: { label: '電腦爬取中', color: '#3B82F6' },
    completed: { label: '已完成', color: '#10B981' },
    failed: { label: '失敗', color: '#EF4444' },
    cancelled: { label: '已取消', color: '#8E8E93' },
};

const KIND_OPTIONS = [
    { key: 'auto', label: '自動偵測' },
    { key: 'novel', label: '小說' },
    { key: 'comic', label: '漫畫' },
];

const formatTime = (ms) => {
    if (!ms) return '';
    try {
        const d = new Date(Number(ms));
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (e) {
        return '';
    }
};

export default function CloudTasksScreen({ navigation }) {
    const { colors } = useTheme();

    const [gasUrl, setGasUrl] = useState('');
    const [apiKey, setApiKey] = useState(DEFAULT_CLOUD_API_KEY);
    const [showConfig, setShowConfig] = useState(false);
    const [testingPing, setTestingPing] = useState(false);

    const [inputUrl, setInputUrl] = useState('');
    const [selectedKind, setSelectedKind] = useState('auto');
    const [submitting, setSubmitting] = useState(false);

    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState('');

    const [importingTaskId, setImportingTaskId] = useState(null);
    const [importStatus, setImportStatus] = useState('');
    const [importRatio, setImportRatio] = useState(0);

    const fetchTasks = useCallback(async (isPull = false, configuredUrl = null) => {
        const cfg = configuredUrl !== null ? { gasUrl: configuredUrl } : await getCloudConfig();
        if (!cfg.gasUrl || !cfg.gasUrl.startsWith('https://')) {
            setTasks([]);
            setLoading(false);
            setRefreshing(false);
            setShowConfig(true);
            return;
        }

        if (isPull) setRefreshing(true);
        try {
            const list = await listCloudTasks();
            setTasks(list);
            setLoadError('');
        } catch (err) {
            setLoadError(err?.message || '無法讀取雲端任務列表');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        let mounted = true;
        const init = async () => {
            const cfg = await getCloudConfig();
            if (!mounted) return;
            setGasUrl(cfg.gasUrl);
            setApiKey(cfg.apiKey || DEFAULT_CLOUD_API_KEY);
            if (!cfg.gasUrl) {
                setShowConfig(true);
                setLoading(false);
            } else {
                await fetchTasks(false, cfg.gasUrl);
            }
        };
        init();
        const unsub = navigation.addListener('focus', () => {
            fetchTasks(false);
        });
        return () => {
            mounted = false;
            unsub();
        };
    }, [navigation, fetchTasks]);

    useEffect(() => {
        const hasActive = tasks.some(t => t.status === 'pending' || t.status === 'processing');
        if (!hasActive || !gasUrl) return undefined;
        const timer = setInterval(() => {
            fetchTasks(false);
        }, 6000);
        return () => clearInterval(timer);
    }, [tasks, gasUrl, fetchTasks]);

    const handleSaveAndTestConfig = async () => {
        const trimmedUrl = gasUrl.trim();
        if (!trimmedUrl.startsWith('https://')) {
            Alert.alert('網址格式錯誤', '請輸入完整的 Google Apps Script Web App 網址（以 https:// 開頭，結尾通常為 /exec）。');
            return;
        }
        setTestingPing(true);
        try {
            const saved = await saveCloudConfig({
                gasUrl: trimmedUrl,
                apiKey: apiKey.trim() || DEFAULT_CLOUD_API_KEY,
            });
            setGasUrl(saved.gasUrl);
            setApiKey(saved.apiKey);
            const pingRes = await pingCloudServer();
            setShowConfig(false);
            Alert.alert('連線成功', pingRes.message || '已成功連線至 Google Apps Script！');
            await fetchTasks(false, saved.gasUrl);
        } catch (err) {
            Alert.alert('連線失敗', err?.message || '請確認 GAS 已部署為「網頁應用程式」且存取權限為「所有人」。');
        } finally {
            setTestingPing(false);
        }
    };

    const handleSubmitUrl = async () => {
        const url = inputUrl.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            Alert.alert('網址格式錯誤', '請輸入 http:// 或 https:// 開頭的書籍／漫畫網址');
            return;
        }
        setSubmitting(true);
        try {
            const res = await submitCloudTask({ url, kind: selectedKind, title: url });
            setInputUrl('');
            await fetchTasks(false);
            Alert.alert(
                res.duplicate ? '已在佇列中' : '已送出雲端任務',
                res.duplicate
                    ? '該網址目前正在排隊或爬取中，請稍候電腦端處理。'
                    : '任務已寫入 Google 雲端硬碟，電腦端啟動 Scrapling 後將自動接單爬取！'
            );
        } catch (err) {
            Alert.alert('送出失敗', err?.message || '無法建立雲端任務');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancelTask = async (task) => {
        try {
            await cancelCloudTask(task.id);
            await fetchTasks(false);
        } catch (err) {
            Alert.alert('取消失敗', err?.message || '無法取消任務');
        }
    };

    const handleDeleteTask = (task) => {
        Alert.alert(
            '刪除紀錄與雲端檔',
            `確定要刪除《${task.title || task.url}》的雲端紀錄及暫存壓縮檔嗎？`,
            [
                { text: '取消', style: 'cancel' },
                {
                    text: '刪除',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteCloudTask(task.id);
                            await fetchTasks(false);
                        } catch (err) {
                            Alert.alert('刪除失敗', err?.message || '無法刪除任務');
                        }
                    },
                },
            ]
        );
    };

    const handleImport = async (task, targetFolderId) => {
        if (importingTaskId) return;
        setImportingTaskId(task.id);
        setImportStatus('準備下載雲端成品...');
        setImportRatio(0);
        try {
            const result = await downloadAndImportCloudTask(
                task,
                (msg, ratio) => {
                    setImportStatus(msg || '');
                    setImportRatio(typeof ratio === 'number' ? ratio : 0);
                },
                targetFolderId
            );
            const destLabel = targetFolderId === 'vault' ? '🔒 私密金庫' : '📚 一般書架';
            Alert.alert(
                '匯入成功',
                `《${result.title}》（共 ${result.downloadedChapters} 章）已匯入至${destLabel}！`
            );
        } catch (err) {
            Alert.alert('匯入失敗', err?.message || '下載或解壓縮過程發生錯誤');
        } finally {
            setImportingTaskId(null);
            setImportStatus('');
            setImportRatio(0);
        }
    };

    const renderTask = ({ item }) => {
        const st = STATUS_META[item.status] || { label: item.status, color: colors.textSecondary };
        const isImporting = importingTaskId === item.id;
        const isComic = item.kind === 'comic' || (item.url && /18comic|jmcomic|boylove/i.test(item.url));
        const filesCount = Array.isArray(item.files) ? item.files.length : 0;

        return (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardTopRow}>
                    <View style={styles.titleWrap}>
                        <Feather
                            name={isComic ? 'image' : 'book-open'}
                            size={16}
                            color={colors.primary}
                            style={{ marginRight: 6 }}
                        />
                        <Text style={[styles.taskTitle, { color: colors.text }]} numberOfLines={1}>
                            {item.title || item.url}
                        </Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: st.color + '20' }]}>
                        <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
                    </View>
                </View>

                <Text style={[styles.urlText, { color: colors.textSecondary }]} numberOfLines={1}>
                    {item.url}
                </Text>

                {item.progress ? (
                    <Text style={[styles.progressText, { color: colors.text }]}>{item.progress}</Text>
                ) : null}

                {item.status === 'failed' && item.error ? (
                    <Text style={[styles.errorText, { color: colors.danger }]}>錯誤：{item.error}</Text>
                ) : null}

                <View style={styles.metaRow}>
                    <Text style={[styles.timeText, { color: colors.textSecondary }]}>
                        更新：{formatTime(item.updatedAt || item.createdAt)}
                        {filesCount > 0 ? `  •  ${filesCount} 個壓縮檔` : ''}
                    </Text>
                    <TouchableOpacity onPress={() => handleDeleteTask(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Feather name="trash-2" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>

                {isImporting ? (
                    <View style={[styles.importingBox, { borderColor: colors.border }]}>
                        <ActivityIndicator size="small" color={colors.primary} />
                        <Text style={{ color: colors.primary, marginLeft: 8, fontSize: 13, flex: 1 }}>
                            {importStatus} ({Math.round(importRatio * 100)}%)
                        </Text>
                    </View>
                ) : null}

                {(item.status === 'pending' || item.status === 'processing') && (
                    <View style={styles.actionRow}>
                        <TouchableOpacity
                            style={[styles.actionBtn, { borderColor: colors.danger, borderWidth: 1 }]}
                            onPress={() => handleCancelTask(item)}
                        >
                            <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>取消任務</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {item.status === 'completed' && !isImporting && (
                    <View style={styles.actionRow}>
                        <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                            onPress={() => handleImport(item, null)}
                            disabled={Boolean(importingTaskId)}
                        >
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>📚 匯入一般書架</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#6366F1' }]}
                            onPress={() => handleImport(item, 'vault')}
                            disabled={Boolean(importingTaskId)}
                        >
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>🔒 匯入私密金庫</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                    <Feather name="arrow-left" size={22} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>☁️ 雲端電腦代抓</Text>
                <View style={styles.headerRight}>
                    <TouchableOpacity onPress={() => fetchTasks(true)} style={styles.iconBtn}>
                        <Feather name="refresh-cw" size={20} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowConfig(v => !v)} style={styles.iconBtn}>
                        <Feather name="sliders" size={20} color={colors.text} />
                    </TouchableOpacity>
                </View>
            </View>

            {showConfig && (
                <View style={[styles.configCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Google Apps Script 連線設定</Text>
                    <TextInput
                        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                        placeholder="貼上 Apps Script /exec 網址..."
                        placeholderTextColor={colors.textSecondary}
                        value={gasUrl}
                        onChangeText={setGasUrl}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    <TextInput
                        style={[styles.input, { color: colors.text, borderColor: colors.border, marginTop: 8 }]}
                        placeholder="API Key (預設 ns_k9m4x7p2v8q5r3w6)"
                        placeholderTextColor={colors.textSecondary}
                        value={apiKey}
                        onChangeText={setApiKey}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    <TouchableOpacity
                        style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 10 }]}
                        onPress={handleSaveAndTestConfig}
                        disabled={testingPing}
                    >
                        {testingPing ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Text style={styles.primaryBtnText}>儲存並測試連線</Text>
                        )}
                    </TouchableOpacity>
                </View>
            )}

            <View style={[styles.submitCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                    placeholder="貼上小說或漫畫網址送交電腦 Scrapling 爬取..."
                    placeholderTextColor={colors.textSecondary}
                    value={inputUrl}
                    onChangeText={setInputUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                <View style={styles.kindRow}>
                    <View style={styles.chipRow}>
                        {KIND_OPTIONS.map(opt => {
                            const active = selectedKind === opt.key;
                            return (
                                <TouchableOpacity
                                    key={opt.key}
                                    style={[
                                        styles.chip,
                                        {
                                            backgroundColor: active ? colors.primary : colors.background,
                                            borderColor: active ? colors.primary : colors.border,
                                        },
                                    ]}
                                    onPress={() => setSelectedKind(opt.key)}
                                >
                                    <Text style={{ color: active ? '#fff' : colors.text, fontSize: 12, fontWeight: '600' }}>
                                        {opt.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    <TouchableOpacity
                        style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]}
                        onPress={handleSubmitUrl}
                        disabled={submitting}
                    >
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                            {submitting ? '送出中...' : '送出代抓'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {loadError ? (
                <View style={styles.bannerError}>
                    <Text style={{ color: colors.danger, fontSize: 13 }}>{loadError}</Text>
                </View>
            ) : null}

            {loading ? (
                <View style={styles.centerBox}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={tasks}
                    keyExtractor={item => item.id}
                    renderItem={renderTask}
                    contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => fetchTasks(true)}
                            tintColor={colors.primary}
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.centerBox}>
                            <Feather name="cloud" size={44} color={colors.textSecondary} style={{ marginBottom: 12 }} />
                            <Text style={{ color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>
                                {gasUrl
                                    ? '目前沒有雲端任務。\n貼上網址或從書源按「雲端電腦 (Scrapling)」即可開始！'
                                    : '請先點擊右上角齒輪，填入 Google Apps Script 網址。'}
                            </Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitle: { fontSize: 18, fontWeight: '700', flex: 1, marginLeft: 8 },
    headerRight: { flexDirection: 'row', alignItems: 'center' },
    iconBtn: { padding: 6 },
    configCard: {
        marginHorizontal: 14,
        marginTop: 12,
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
    },
    submitCard: {
        marginHorizontal: 14,
        marginTop: 12,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 10 },
    input: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        height: 42,
        fontSize: 14,
    },
    kindRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 10,
    },
    chipRow: { flexDirection: 'row', gap: 6 },
    chip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 14,
        borderWidth: 1,
    },
    submitBtn: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
    },
    primaryBtn: {
        height: 40,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    bannerError: { paddingHorizontal: 16, paddingTop: 10 },
    centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    card: {
        borderRadius: 12,
        borderWidth: 1,
        padding: 14,
        marginBottom: 12,
    },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    titleWrap: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
    taskTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    badgeText: { fontSize: 11, fontWeight: '700' },
    urlText: { fontSize: 12, marginTop: 4 },
    progressText: { fontSize: 13, marginTop: 8, fontWeight: '500' },
    errorText: { fontSize: 12, marginTop: 6 },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 10,
    },
    timeText: { fontSize: 11 },
    importingBox: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    actionRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
    },
    actionBtn: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
