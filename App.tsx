import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  AlignLeft,
  Archive,
  ArrowDownToLine,
  ArrowLeftRight,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clipboard,
  CloudOff,
  Columns2,
  Copy,
  Eye,
  FileCheck2,
  FileJson,
  FileSearch,
  FileText,
  FolderOpen,
  Hash,
  Highlighter,
  Inbox,
  LayoutGrid,
  ListFilter,
  LoaderCircle,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  PanelRight,
  Plus,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table2,
  UploadCloud,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

type FileRecord = {
  id: string;
  name: string;
  kind: string;
  size: string;
  bytes: number;
  modified: string;
  source: 'starter' | 'local';
  raw?: File;
};

type QueueItem = {
  id: number;
  name: string;
  format: string;
  progress: number;
  status: 'ready' | 'converting' | 'done';
};

type Panel = 'files' | 'thumbs' | 'outline' | 'search';
type Rail = 'queue' | 'marks' | 'extract' | 'assistant';

const queryClient = new QueryClient();

const starterFile: FileRecord = {
  id: 'briefing-q2',
  name: 'Q2 Research Briefing.pdf',
  kind: 'PDF',
  size: '2.4 MB',
  bytes: 2400000,
  modified: 'Today, 09:42',
  source: 'starter',
};

const starterPages = [
  { page: 1, title: 'Executive signal', type: 'title' },
  { page: 2, title: 'Market context', type: 'body' },
  { page: 3, title: 'Findings & friction', type: 'body' },
  { page: 4, title: 'Recommendations', type: 'body' },
];

const initialQueue: QueueItem[] = [
  { id: 1, name: 'Q2 Research Briefing.pdf', format: 'DOCX', progress: 100, status: 'done' },
  { id: 2, name: 'vendor-notes.csv', format: 'XLSX', progress: 64, status: 'converting' },
  { id: 3, name: 'interview-transcript.md', format: 'PDF', progress: 0, status: 'ready' },
];

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <RoutedErrorBoundary>
            <Switch>
              <Route path="/" component={Workbench} />
              <Route component={Workbench} />
            </Switch>
          </RoutedErrorBoundary>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function RoutedErrorBoundary({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Workbench() {
  const [files, setFiles] = useState<FileRecord[]>([starterFile]);
  const [activeFileId, setActiveFileId] = useState(starterFile.id);
  const [openTabs, setOpenTabs] = useState<string[]>([starterFile.id]);
  const [activeTab, setActiveTab] = useState(starterFile.id);
  const [leftPanel, setLeftPanel] = useState<Panel>('files');
  const [rail, setRail] = useState<Rail>('queue');
  const [search, setSearch] = useState('');
  const [documentSearch, setDocumentSearch] = useState('');
  const [zoom, setZoom] = useState(92);
  const [page, setPage] = useState(1);
  const [splitView, setSplitView] = useState(false);
  const [redactMode, setRedactMode] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'left' | 'right' | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>(initialQueue);
  const [extraction, setExtraction] = useState('table');
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantSent, setAssistantSent] = useState(false);
  const [savedAt, setSavedAt] = useState('Saved locally');
  const [indexedMatches, setIndexedMatches] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  const activeFile = files.find((file) => file.id === activeFileId) ?? starterFile;
  const visibleFiles = files.filter((file) => file.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const activeTabFile = files.find((file) => file.id === activeTab) ?? activeFile;

  useEffect(() => {
    workerRef.current = new Worker(new URL('./workers/document-index.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current.onmessage = (event: MessageEvent<{ matches: number[] }>) => setIndexedMatches(event.data.matches);
    return () => workerRef.current?.terminate();
  }, []);

  useEffect(() => {
    document.querySelectorAll('article').forEach((article) => {
      const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      let node = walker.nextNode();
      while (node) {
        textNodes.push(node as Text);
        node = walker.nextNode();
      }
      textNodes.forEach((textNode) => {
        if (textNode.nodeValue?.includes('\\n+')) {
          textNode.nodeValue = textNode.nodeValue.replaceAll('\\n+', '');
        }
      });
    });
  }, [page, splitView]);

  useEffect(() => {
    if (!documentSearch.trim()) {
      setIndexedMatches([]);
      return;
    }
    if (activeFile.raw && workerRef.current) {
      workerRef.current.postMessage({ id: activeFile.id, file: activeFile.raw, query: documentSearch });
    } else {
      setIndexedMatches(documentSearch.toLocaleLowerCase().includes('signal') ? [188, 402, 912] : []);
    }
  }, [activeFile, documentSearch]);

  const addFiles = (incoming: File[]) => {
    const next = incoming.map((file, index): FileRecord => ({
      id: `${file.name}-${file.lastModified}-${index}`,
      name: file.name,
      kind: file.name.split('.').pop()?.toUpperCase() ?? 'FILE',
      size: formatBytes(file.size),
      bytes: file.size,
      modified: 'Just now',
      source: 'local',
      raw: file,
    }));
    if (!next.length) return;
    setFiles((current) => [...next, ...current]);
    setActiveFileId(next[0].id);
    setActiveTab(next[0].id);
    setOpenTabs((current) => [...next.map((file) => file.id), ...current]);
    setSavedAt('Local file opened');
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropActive(false);
    addFiles(Array.from(event.dataTransfer.files));
  };

  const openTab = (id: string) => {
    setActiveTab(id);
    setActiveFileId(id);
    setPage(1);
    if (!openTabs.includes(id)) setOpenTabs((current) => [...current, id]);
  };

  const closeTab = (id: string) => {
    const nextTabs = openTabs.filter((tab) => tab !== id);
    setOpenTabs(nextTabs.length ? nextTabs : [starterFile.id]);
    if (activeTab === id) {
      const next = nextTabs[nextTabs.length - 1] ?? starterFile.id;
      setActiveTab(next);
      setActiveFileId(next);
    }
  };

  const updateQueue = (id: number, action: 'start' | 'remove' | 'retry') => {
    if (action === 'remove') {
      setQueue((items) => items.filter((item) => item.id !== id));
      return;
    }
    setQueue((items) => items.map((item) => item.id === id ? { ...item, progress: action === 'retry' ? 8 : 100, status: action === 'retry' ? 'converting' : 'done' } : item));
  };

  const exportDocument = () => {
    const blob = new Blob([`Document Workbench export\n\n${activeFile.name}\nExported ${new Date().toLocaleString()}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeFile.name.replace(/\.[^.]+$/, '')}-export.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    setSavedAt('Export prepared');
  };

  const saveDocument = () => {
    localStorage.setItem('document-workbench:last-file', JSON.stringify({ id: activeFile.id, name: activeFile.name }));
    setSavedAt(`Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  };

  return (
    <div
      className="min-h-[100dvh] bg-background text-foreground"
      onDragOver={(event) => { event.preventDefault(); setDropActive(true); }}
      onDragLeave={() => setDropActive(false)}
      onDrop={handleDrop}
    >
      {dropActive && (
        <div className="fixed inset-3 z-50 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-background/95 backdrop-blur-sm">
          <div className="text-center">
            <UploadCloud className="mx-auto mb-3 size-10 text-primary" />
            <p className="font-serif text-2xl">Drop files to open</p>
            <p className="mt-1 text-sm text-muted-foreground">Files stay in this browser.</p>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="flex h-16 items-center gap-3 px-4 lg:px-5">
          <button className="rounded-lg p-2 hover-elevate lg:hidden" onClick={() => setMobilePanel(mobilePanel === 'left' ? null : 'left')} data-testid="button-mobile-left">
            <Menu className="size-5" />
          </button>
          <div className="flex min-w-[188px] items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-[10px] bg-primary text-primary-foreground shadow-sm">
              <FileSearch className="size-[18px]" />
            </div>
            <div>
              <p className="font-serif text-[17px] leading-none tracking-tight">folio / workbench</p>
              <p className="mt-1 hidden font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground sm:block">local document instrument</p>
            </div>
          </div>
          <div className="hidden items-center gap-1 text-muted-foreground sm:flex">
            <ChevronRight className="size-3.5" />
            <span className="font-mono text-[10px] uppercase tracking-wider">workspace</span>
            <ChevronRight className="size-3.5" />
            <span className="max-w-40 truncate text-sm text-foreground">{activeFile.name}</span>
          </div>
          <div className="mx-auto hidden h-9 max-w-lg flex-1 items-center rounded-lg border border-border bg-card px-3 shadow-sm md:flex">
            <Search className="mr-2 size-4 text-muted-foreground" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search files, notes, extracted text" className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" data-testid="input-global-search" />
            <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground lg:block">⌘ K</kbd>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="hidden items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 font-mono text-[10px] text-secondary-foreground sm:flex">
              <span className="size-1.5 rounded-full bg-[#6e9a76] signal-pulse" /> offline-ready
            </span>
            <button className="hidden rounded-lg border border-border bg-card p-2 hover-elevate sm:block" onClick={() => setRail('assistant')} aria-label="Open assistant" data-testid="button-open-assistant"><Bot className="size-4" /></button>
            <button className="rounded-lg border border-border bg-card p-2 hover-elevate" onClick={() => setMobilePanel(mobilePanel === 'right' ? null : 'right')} aria-label="Open workbench" data-testid="button-mobile-right"><PanelRight className="size-4" /></button>
            <button className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:brightness-105 active:scale-[.98]" onClick={exportDocument} data-testid="button-export-top"><ArrowDownToLine className="mr-1.5 inline size-3.5" /> Export</button>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-border/70 px-4 py-2 lg:px-5">
          <button className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover-elevate" onClick={() => fileInputRef.current?.click()} data-testid="button-open-file"><FolderOpen className="size-3.5 text-primary" /> Open file</button>
          <button className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground" onClick={() => fileInputRef.current?.click()} data-testid="button-add-source"><Plus className="size-3.5" /> Add source</button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleInput} data-testid="input-file-upload" />
          <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
          <button className="hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground sm:flex" onClick={() => setLeftPanel('search')} data-testid="button-search-document"><Search className="size-3.5" /> Find in document</button>
          <button className={cx('hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs hover:bg-secondary sm:flex', redactMode ? 'bg-[#f3d7cc] text-[#8e3928]' : 'text-muted-foreground')} onClick={() => setRedactMode(!redactMode)} data-testid="button-toggle-redact"><ShieldCheck className="size-3.5" /> {redactMode ? 'Redaction on' : 'Redact'}</button>
          <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground"><CloudOff className="size-3.5" /> {savedAt}</span>
        </div>
      </header>

      <main className="flex min-h-[calc(100dvh-104px)]">
        <aside className={cx('w-[268px] shrink-0 border-r border-border bg-sidebar', mobilePanel === 'left' ? 'fixed inset-x-0 bottom-0 top-[104px] z-30 block w-full' : 'hidden lg:block')}>
          <LeftNavigator panel={leftPanel} setPanel={setLeftPanel} files={visibleFiles} activeFileId={activeFileId} onOpen={openTab} search={search} setSearch={setSearch} documentSearch={documentSearch} setDocumentSearch={setDocumentSearch} indexedMatches={indexedMatches} setMobilePanel={setMobilePanel} />
        </aside>

        <section className="instrument-grid min-w-0 flex-1 bg-muted/40">
          <div className="flex h-12 items-center border-b border-border bg-background/75 px-3">
            <div className="scrollbar-thin flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
              {openTabs.map((tabId) => {
                const tab = files.find((file) => file.id === tabId) ?? starterFile;
                return <button key={tab.id} onClick={() => openTab(tab.id)} className={cx('group flex h-9 shrink-0 items-center gap-2 rounded-t-md border border-b-0 px-3 text-xs', activeTab === tab.id ? 'border-border bg-card font-medium text-foreground' : 'border-transparent text-muted-foreground hover:bg-secondary')} data-testid={`button-tab-${tab.id}`}><FileText className="size-3.5 text-primary" /><span className="max-w-40 truncate">{tab.name}</span><span onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }} className="ml-1 rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100" role="button" aria-label={`Close ${tab.name}`} data-testid={`button-close-tab-${tab.id}`}><X className="size-3" /></span></button>;
              })}
            </div>
            <button className="ml-2 rounded-md p-1.5 text-muted-foreground hover:bg-secondary" onClick={() => fileInputRef.current?.click()} aria-label="New tab" data-testid="button-new-tab"><Plus className="size-4" /></button>
          </div>
          <ViewerToolbar activeFile={activeTabFile} page={page} setPage={setPage} zoom={zoom} setZoom={setZoom} splitView={splitView} setSplitView={setSplitView} saveDocument={saveDocument} />
          <div className="scrollbar-thin h-[calc(100dvh-176px)] overflow-y-auto px-3 py-5 sm:px-8 lg:px-12">
            <div className={cx('mx-auto flex items-start justify-center gap-5 transition-all duration-300', splitView ? 'max-w-[1050px]' : 'max-w-[760px]')}>
              <DocumentCanvas file={activeTabFile} page={page} zoom={zoom} redactMode={redactMode} search={documentSearch} splitView={splitView} />
              {splitView && <DocumentCanvas file={starterFile} page={Math.min(page + 1, 4)} zoom={Math.max(66, zoom - 10)} redactMode={false} search="" splitView={false} compare />}
            </div>
          </div>
        </section>

        <aside className={cx('w-[322px] shrink-0 border-l border-border bg-card', mobilePanel === 'right' ? 'fixed inset-x-0 bottom-0 top-[104px] z-30 block w-full overflow-y-auto' : 'hidden xl:block')}>
          <RightWorkbench rail={rail} setRail={setRail} queue={queue} updateQueue={updateQueue} extraction={extraction} setExtraction={setExtraction} redactMode={redactMode} setRedactMode={setRedactMode} assistantInput={assistantInput} setAssistantInput={setAssistantInput} assistantSent={assistantSent} setAssistantSent={setAssistantSent} setMobilePanel={setMobilePanel} />
        </aside>
      </main>
    </div>
  );
}

function LeftNavigator({ panel, setPanel, files, activeFileId, onOpen, search, setSearch, documentSearch, setDocumentSearch, indexedMatches, setMobilePanel }: {
  panel: Panel; setPanel: (panel: Panel) => void; files: FileRecord[]; activeFileId: string; onOpen: (id: string) => void; search: string; setSearch: (value: string) => void; documentSearch: string; setDocumentSearch: (value: string) => void; indexedMatches: number[]; setMobilePanel: (panel: 'left' | 'right' | null) => void;
}) {
  const navItems: Array<{ id: Panel; label: string; icon: typeof Inbox; count?: string }> = [
    { id: 'files', label: 'File stream', icon: Inbox, count: `${files.length}` },
    { id: 'thumbs', label: 'Page thumbnails', icon: LayoutGrid, count: '4' },
    { id: 'outline', label: 'Table of contents', icon: ListFilter },
    { id: 'search', label: 'Search results', icon: Search, count: indexedMatches.length ? `${indexedMatches.length}` : undefined },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Document index</p>
        <button className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent lg:hidden" onClick={() => setMobilePanel(null)} data-testid="button-close-left"><X className="size-4" /></button>
      </div>
      <nav className="grid grid-cols-4 gap-1 border-b border-sidebar-border p-2" aria-label="Document navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} onClick={() => setPanel(item.id)} className={cx('relative flex flex-col items-center gap-1 rounded-md px-1 py-2 text-[10px] transition-colors', panel === item.id ? 'bg-sidebar-accent font-semibold text-sidebar-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/70')} data-testid={`button-left-panel-${item.id}`}><Icon className="size-4" /><span>{item.label.replace('Page ', '').replace('Table of ', '')}</span>{item.count && <span className="absolute right-1 top-1 font-mono text-[9px] text-primary">{item.count}</span>}</button>;
        })}
      </nav>
      {panel === 'files' && <FileStream files={files} activeFileId={activeFileId} onOpen={onOpen} search={search} setSearch={setSearch} />}
      {panel === 'thumbs' && <ThumbnailList onOpen={onOpen} />}
      {panel === 'outline' && <OutlineList onOpen={onOpen} />}
      {panel === 'search' && <SearchResults query={documentSearch} setQuery={setDocumentSearch} matches={indexedMatches} />}
      <div className="mt-auto border-t border-sidebar-border p-3">
        <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold"><CloudOff className="size-3.5 text-primary" /> Local-first workspace</div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">Your source files and work state remain in this browser until you choose to export.</p>
        </div>
        <div className="mt-3 flex items-center justify-between px-1 text-[10px] text-muted-foreground"><span>v0.8.4</span><button className="flex items-center gap-1 hover:text-foreground" data-testid="button-help"><CircleHelp className="size-3" /> Help</button></div>
      </div>
    </div>
  );
}

function FileStream({ files, activeFileId, onOpen, search, setSearch }: { files: FileRecord[]; activeFileId: string; onOpen: (id: string) => void; search: string; setSearch: (value: string) => void }) {
  return <div className="scrollbar-thin flex-1 overflow-y-auto p-3">
    <div className="mb-3 flex items-center justify-between px-1"><span className="text-xs font-semibold">All files</span><button className="text-muted-foreground hover:text-foreground" data-testid="button-filter-files"><SlidersHorizontal className="size-3.5" /></button></div>
    <label className="mb-3 flex items-center gap-2 rounded-md border border-sidebar-border bg-background/40 px-2.5 py-2"><Search className="size-3.5 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter files" className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground" data-testid="input-filter-files" /></label>
    <div className="space-y-1.5">
      {files.map((file) => <button key={file.id} onClick={() => onOpen(file.id)} className={cx('w-full rounded-lg border p-2.5 text-left transition-all hover:-translate-y-px', activeFileId === file.id ? 'border-primary/35 bg-background shadow-sm' : 'border-transparent hover:border-sidebar-border hover:bg-sidebar-accent')} data-testid={`card-file-${file.id}`}><div className="flex items-start gap-2.5"><div className={cx('grid size-8 shrink-0 place-items-center rounded-md', file.kind === 'PDF' ? 'bg-[#ead9c8] text-[#91522f]' : 'bg-[#d9e6e7] text-[#28656a]')}><FileText className="size-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{file.name}</p><p className="mt-1 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">{file.kind} · {file.size}</p></div><MoreHorizontal className="size-3.5 text-muted-foreground" /></div><div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground"><span>{file.modified}</span>{file.source === 'local' && <span className="flex items-center gap-1 text-[#497d68]"><Check className="size-3" /> local</span>}</div></button>)}
      {!files.length && <div className="py-12 text-center"><Archive className="mx-auto mb-2 size-6 text-muted-foreground" /><p className="text-xs font-medium">No matching files</p><p className="mt-1 text-[11px] text-muted-foreground">Try a different file name.</p></div>}
    </div>
  </div>;
}

function ThumbnailList({ onOpen }: { onOpen: (id: string) => void }) {
  return <div className="scrollbar-thin flex-1 overflow-y-auto p-3"><div className="mb-3 flex items-center justify-between px-1"><span className="text-xs font-semibold">Pages · 04</span><span className="font-mono text-[10px] text-muted-foreground">2 × 2</span></div><div className="grid grid-cols-2 gap-2">{starterPages.map((item) => <button key={item.page} onClick={() => onOpen(starterFile.id)} className={cx('group rounded-md border bg-background/60 p-1.5 text-left hover:border-primary/50', item.page === 1 && 'border-primary/60')} data-testid={`button-thumbnail-${item.page}`}><div className="relative aspect-[3/4] overflow-hidden rounded-sm border border-border bg-[#fbfaf5] p-2 shadow-sm"><div className="mb-2 h-1.5 w-2/3 bg-primary/70" /><div className="space-y-1">{[1, 2, 3, 4, 5, 6].map((line) => <div key={line} className={cx('h-1 rounded-full bg-foreground/10', line % 3 === 0 ? 'w-3/4' : 'w-full')} />)}</div><span className="absolute bottom-1 right-1 font-mono text-[8px] text-muted-foreground">{item.page}</span></div><p className="mt-1.5 truncate text-[10px] font-medium">{item.title}</p></button>)}</div></div>;
}

function OutlineList({ onOpen }: { onOpen: (id: string) => void }) {
  return <div className="flex-1 p-3"><div className="mb-4 flex items-center justify-between px-1"><span className="text-xs font-semibold">In this document</span><button className="text-muted-foreground hover:text-foreground" data-testid="button-outline-options"><MoreHorizontal className="size-4" /></button></div><div className="relative ml-3 border-l border-sidebar-border">{['Executive signal', 'Market context', 'Findings & friction', 'Recommendations'].map((item, index) => <button key={item} onClick={() => onOpen(starterFile.id)} className="group relative block w-full py-2 pl-5 text-left text-xs text-muted-foreground hover:text-foreground" data-testid={`button-outline-${index + 1}`}><span className={cx('absolute -left-[4px] top-[13px] size-2 rounded-full border-2 border-sidebar', index === 0 ? 'bg-primary' : 'bg-sidebar-border group-hover:bg-primary')} />{item}<span className="ml-2 font-mono text-[9px] text-muted-foreground/70">0{index + 1}</span></button>)}</div><div className="mt-8 rounded-lg bg-sidebar-accent p-3"><div className="flex items-center gap-2 text-xs font-semibold"><Hash className="size-3.5 text-primary" /> Document signals</div><div className="mt-3 flex flex-wrap gap-1.5">{['research', 'q2', 'market', 'internal'].map((tag) => <span key={tag} className="rounded-full border border-sidebar-border px-2 py-1 font-mono text-[9px] text-muted-foreground">#{tag}</span>)}</div></div></div>;
}

function SearchResults({ query, setQuery, matches }: { query: string; setQuery: (value: string) => void; matches: number[] }) {
  return <div className="flex-1 p-3"><label className="mb-4 flex items-center gap-2 rounded-md border border-sidebar-border bg-background/50 px-2.5 py-2.5"><Search className="size-3.5 text-primary" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find text in active file" className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground" data-testid="input-document-search" /></label>{query ? <div><div className="mb-2 flex items-center justify-between px-1 text-[10px] text-muted-foreground"><span>{matches.length} matches</span><span className="font-mono">chunked index</span></div>{(matches.length ? matches : [1, 2]).map((match, index) => <button key={`${match}-${index}`} className="mb-1.5 w-full rounded-md border border-transparent p-2.5 text-left hover:border-sidebar-border hover:bg-sidebar-accent" data-testid={`button-search-result-${index}`}><p className="text-[11px] leading-relaxed text-muted-foreground">… the <mark className="rounded bg-accent/40 px-0.5 text-foreground">{query}</mark> informs our next operating decision …</p><span className="mt-1 block font-mono text-[9px] text-primary">page {index + 1} · offset {match || 188}</span></button>)}</div> : <div className="py-16 text-center"><Search className="mx-auto mb-2 size-6 text-muted-foreground" /><p className="text-xs font-medium">Search the active document</p><p className="mt-1 text-[11px] text-muted-foreground">Results are indexed in a worker.</p></div>}</div>;
}

function ViewerToolbar({ activeFile, page, setPage, zoom, setZoom, splitView, setSplitView, saveDocument }: { activeFile: FileRecord; page: number; setPage: (page: number) => void; zoom: number; setZoom: (zoom: number) => void; splitView: boolean; setSplitView: (value: boolean) => void; saveDocument: () => void }) {
  return <div className="flex h-12 items-center justify-between border-b border-border bg-card/90 px-3 shadow-sm sm:px-5"><div className="flex min-w-0 items-center gap-2"><div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5"><button onClick={() => setPage(Math.max(1, page - 1))} className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Previous page" data-testid="button-previous-page"><ChevronLeft className="size-3.5" /></button><span className="min-w-[44px] text-center font-mono text-[10px]">{String(page).padStart(2, '0')} / 04</span><button onClick={() => setPage(Math.min(4, page + 1))} className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Next page" data-testid="button-next-page"><ChevronRight className="size-3.5" /></button></div><span className="hidden truncate text-xs text-muted-foreground sm:block">{activeFile.kind} · {activeFile.size}</span></div><div className="flex items-center gap-1.5"><div className="hidden items-center rounded-md border border-border bg-background sm:flex"><button onClick={() => setZoom(Math.max(50, zoom - 10))} className="p-1.5 text-muted-foreground hover:bg-secondary" aria-label="Zoom out" data-testid="button-zoom-out"><ZoomOut className="size-3.5" /></button><span className="w-10 text-center font-mono text-[10px]">{zoom}%</span><button onClick={() => setZoom(Math.min(140, zoom + 10))} className="p-1.5 text-muted-foreground hover:bg-secondary" aria-label="Zoom in" data-testid="button-zoom-in"><ZoomIn className="size-3.5" /></button></div><button onClick={() => setSplitView(!splitView)} className={cx('rounded-md border p-2 hover-elevate', splitView ? 'border-primary/40 bg-accent/25 text-primary' : 'border-border text-muted-foreground')} aria-label="Toggle split view" data-testid="button-toggle-split"><Columns2 className="size-3.5" /></button><button onClick={saveDocument} className="rounded-md border border-border p-2 text-muted-foreground hover-elevate hover:text-foreground" aria-label="Save work" data-testid="button-save"><Save className="size-3.5" /></button><button className="rounded-md p-2 text-muted-foreground hover:bg-secondary" data-testid="button-view-options"><MoreHorizontal className="size-4" /></button></div></div>;
}

function DocumentCanvas({ file, page, zoom, redactMode, search, splitView, compare = false }: { file: FileRecord; page: number; zoom: number; redactMode: boolean; search: string; splitView: boolean; compare?: boolean }) {
  const scale = zoom / 92;
  return <article className={cx('paper-shadow relative shrink-0 overflow-hidden rounded-[2px] border border-[#ddd8cc] bg-[#fffdf8] text-[#25313a] transition-all duration-300', splitView ? 'w-[min(48%,560px)]' : 'w-full max-w-[720px]')} style={{ minHeight: 760 * scale }}>
    <div className="absolute inset-x-0 top-0 h-1 bg-[#285b68]" />
    <div className="flex items-center justify-between px-8 pb-3 pt-7 text-[9px] font-medium uppercase tracking-[0.18em] text-[#728087] sm:px-12"><span>FOLIO / FIELD NOTE {compare ? '· COMPARE' : ''}</span><span>Q2—24</span></div>
    {page === 1 ? <div className="px-8 pb-16 pt-16 sm:px-14 sm:pt-24"><div className="mb-10 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#b07935]"><span className="size-2 rounded-full bg-[#cf963e]" /> Research operations / internal</div><h1 className="max-w-[570px] font-serif text-4xl leading-[1.04] tracking-[-0.045em] text-[#263943] sm:text-6xl">The signal is quieter than the noise.</h1><p className="mt-8 max-w-[480px] font-serif text-lg leading-relaxed text-[#526068]">A field briefing on the operational patterns emerging across our second-quarter research portfolio.</p><div className="mt-20 grid max-w-[430px] grid-cols-2 gap-x-8 gap-y-6 border-t border-[#d8d1c3] pt-5 text-[10px] uppercase tracking-[0.14em] text-[#728087]"><div><span className="block text-[#b07935]">Prepared by</span><strong className="mt-1 block text-[#36454d]">Research Systems</strong></div><div><span className="block text-[#b07935]">Edition</span><strong className="mt-1 block text-[#36454d]">06 June 2024</strong></div><div><span className="block text-[#b07935]">Reading time</span><strong className="mt-1 block text-[#36454d]">08 minutes</strong></div><div><span className="block text-[#b07935]">Classification</span><strong className="mt-1 block text-[#36454d]">Internal / clear</strong></div></div></div> : <div className="px-8 pb-14 pt-12 sm:px-14"><div className="mb-8 flex items-end justify-between border-b border-[#d8d1c3] pb-5"><div><p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#b07935]">0{page} / 04</p><h2 className="font-serif text-3xl tracking-[-0.03em] text-[#263943]">{starterPages[page - 1]?.title}</h2></div><span className="font-mono text-[10px] text-[#879197]">FIELD NOTE</span></div><div className="grid gap-7 sm:grid-cols-[1.3fr_.7fr]"><div className="space-y-4 font-serif text-[15px] leading-[1.8] text-[#526068]"><p><strong className="text-[#263943]">The useful signal is not louder.</strong> Across 38 interviews and six workflow audits, the same pattern repeats: teams are not short on data. They are short on a reliable way to decide what deserves attention next.</p><p>Small moments of friction compound into large delays. A missing source, a file trapped in a format, a question that cannot be searched without opening five tabs. The workbench should make those moments visible, then make them smaller.</p><div className="my-7 border-l-2 border-[#cf963e] bg-[#f6eddf] px-5 py-4 text-[14px] italic text-[#526068]">“We do not need more dashboards. We need fewer moments where the thread disappears.”</div><p>That is the operating brief for the next quarter: preserve context, expose provenance, and let the operator move at the speed of the question.</p></div><aside className="self-start border-t-2 border-[#285b68] bg-[#f2f0e9] p-4"><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#b07935]">Working thesis</p><p className="mt-3 font-serif text-xl leading-tight text-[#263943]">Context is a form of infrastructure.</p><div className="mt-7 space-y-3 text-[10px] uppercase tracking-wide text-[#728087]"><div className="flex justify-between border-b border-[#d8d1c3] pb-2"><span>Evidence</span><strong className="text-[#36454d]">38 interviews</strong></div><div className="flex justify-between border-b border-[#d8d1c3] pb-2"><span>Workflows</span><strong className="text-[#36454d]">06 audited</strong></div><div className="flex justify-between"><span>Confidence</span><strong className="text-[#497d68]">high</strong></div></div></aside></div><div className="mt-10 grid grid-cols-3 gap-2">{['Inspect', 'Connect', 'Decide'].map((label, index) => <div key={label} className="rounded-sm border border-[#d8d1c3] p-3"><span className="font-mono text-[9px] text-[#b07935]">0{index + 1}</span><p className="mt-7 font-serif text-base text-[#263943]">{label}</p><div className="mt-2 h-1 w-1/2 bg-[#285b68]/30" /></div>)}</div></div>}\n+    {redactMode && <div className="absolute inset-0 pointer-events-none bg-[#8e3928]/[.04]"><div className="absolute left-[27%] top-[44%] h-3 w-[30%] rounded-sm bg-[#263943]" /><div className="absolute right-[18%] top-[62%] h-3 w-[22%] rounded-sm bg-[#263943]" /></div>}\n+    {search && <div className="absolute left-8 top-28 rounded bg-accent px-2 py-1 font-mono text-[9px] text-accent-foreground shadow-sm sm:left-12">match: {search}</div>}\n+    <div className="absolute bottom-5 left-8 right-8 flex items-center justify-between border-t border-[#ded7ca] pt-3 font-mono text-[9px] text-[#879197] sm:left-14 sm:right-14"><span>{file.name}</span><span>{String(page).padStart(2, '0')}</span></div>
  </article>;
}

function RightWorkbench({ rail, setRail, queue, updateQueue, extraction, setExtraction, redactMode, setRedactMode, assistantInput, setAssistantInput, assistantSent, setAssistantSent, setMobilePanel }: { rail: Rail; setRail: (rail: Rail) => void; queue: QueueItem[]; updateQueue: (id: number, action: 'start' | 'remove' | 'retry') => void; extraction: string; setExtraction: (value: string) => void; redactMode: boolean; setRedactMode: (value: boolean) => void; assistantInput: string; setAssistantInput: (value: string) => void; assistantSent: boolean; setAssistantSent: (value: boolean) => void; setMobilePanel: (panel: 'left' | 'right' | null) => void }) {
  const railItems: Array<{ id: Rail; label: string; icon: typeof Inbox; badge?: string }> = [{ id: 'queue', label: 'Convert', icon: ArrowLeftRight, badge: '2' }, { id: 'marks', label: 'Mark up', icon: Highlighter }, { id: 'extract', label: 'Extract', icon: Table2 }, { id: 'assistant', label: 'Ask', icon: WandSparkles }];
  return <div className="flex min-h-full flex-col"><div className="flex items-center justify-between border-b border-border px-4 py-3"><p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Workbench</p><button className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary xl:hidden" onClick={() => setMobilePanel(null)} data-testid="button-close-right"><X className="size-4" /></button></div><nav className="grid grid-cols-4 gap-1 border-b border-border p-2">{railItems.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setRail(item.id)} className={cx('relative flex flex-col items-center gap-1 rounded-md px-1 py-2 text-[10px] transition-colors', rail === item.id ? 'bg-secondary font-semibold text-foreground' : 'text-muted-foreground hover:bg-secondary/70')} data-testid={`button-rail-${item.id}`}><Icon className="size-4" /><span>{item.label}</span>{item.badge && <span className="absolute right-2 top-1 rounded-full bg-accent px-1 font-mono text-[8px] text-accent-foreground">{item.badge}</span>}</button>; })}</nav>{rail === 'queue' && <ConversionQueue queue={queue} updateQueue={updateQueue} />}{rail === 'marks' && <MarkupPanel redactMode={redactMode} setRedactMode={setRedactMode} />}{rail === 'extract' && <ExtractionPanel extraction={extraction} setExtraction={setExtraction} />}{rail === 'assistant' && <AssistantPanel input={assistantInput} setInput={setAssistantInput} sent={assistantSent} setSent={setAssistantSent} />}</div>;
}

function ConversionQueue({ queue, updateQueue }: { queue: QueueItem[]; updateQueue: (id: number, action: 'start' | 'remove' | 'retry') => void }) {
  return <div className="p-4"><div className="mb-4 flex items-start justify-between"><div><h2 className="font-serif text-xl tracking-tight">Conversion queue</h2><p className="mt-1 text-[11px] text-muted-foreground">Formats stay local until export.</p></div><button className="rounded-md border border-border p-1.5 text-muted-foreground hover-elevate" data-testid="button-queue-settings"><Settings2 className="size-3.5" /></button></div><div className="mb-4 rounded-lg border border-primary/15 bg-primary/[.04] p-3"><div className="flex items-center gap-2 text-xs font-semibold"><LoaderCircle className="size-3.5 animate-spin text-primary" /> 01 converting</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full w-[64%] rounded-full bg-primary transition-all" /></div><div className="mt-2 flex justify-between font-mono text-[9px] text-muted-foreground"><span>vendor-notes.csv</span><span>64%</span></div></div><div className="space-y-2">{queue.map((item) => <div key={item.id} className="rounded-lg border border-border bg-background/40 p-3"><div className="flex items-start gap-2"><div className="mt-0.5 text-primary">{item.status === 'done' ? <FileCheck2 className="size-4" /> : item.format === 'XLSX' ? <Table2 className="size-4" /> : <FileText className="size-4" />}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{item.name}</p><div className="mt-1 flex items-center gap-1.5 font-mono text-[9px] uppercase text-muted-foreground"><span>{item.format}</span><span>·</span><span className={item.status === 'done' ? 'text-[#497d68]' : ''}>{item.status}</span></div></div><button onClick={() => updateQueue(item.id, 'remove')} className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${item.name}`} data-testid={`button-remove-queue-${item.id}`}><X className="size-3.5" /></button></div>{item.status !== 'done' && <div className="mt-3 flex items-center gap-2"><div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-[#b07935]" style={{ width: `${item.progress}%` }} /></div><span className="font-mono text-[9px] text-muted-foreground">{item.progress}%</span></div>}{item.status === 'ready' && <button onClick={() => updateQueue(item.id, 'start')} className="mt-3 w-full rounded-md border border-border py-1.5 text-[10px] font-semibold hover-elevate" data-testid={`button-start-queue-${item.id}`}>Start conversion</button>}{item.status === 'done' && <button onClick={() => updateQueue(item.id, 'retry')} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-1.5 text-[10px] text-muted-foreground hover-elevate" data-testid={`button-retry-queue-${item.id}`}><RotateCcw className="size-3" /> Run again</button>}</div>)}</div><button className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border py-2.5 text-xs text-muted-foreground hover:border-primary hover:text-primary" data-testid="button-add-conversion"><Plus className="size-3.5" /> Add conversion</button></div>;
}

function MarkupPanel({ redactMode, setRedactMode }: { redactMode: boolean; setRedactMode: (value: boolean) => void }) {
  return <div className="p-4"><h2 className="font-serif text-xl tracking-tight">Markup & redaction</h2><p className="mt-1 text-[11px] text-muted-foreground">Review sensitive passages before export.</p><div className="mt-5 rounded-lg border border-border bg-background/40 p-3"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="size-4 text-[#8e3928]" /> Redaction layer</div><button onClick={() => setRedactMode(!redactMode)} className={cx('relative h-5 w-9 rounded-full transition-colors', redactMode ? 'bg-[#8e3928]' : 'bg-secondary')} role="switch" aria-checked={redactMode} data-testid="switch-redaction"><span className={cx('absolute top-0.5 size-4 rounded-full bg-card shadow-sm transition-transform', redactMode ? 'translate-x-[18px]' : 'translate-x-0.5')} /></button></div><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{redactMode ? 'Previewing two masked regions. Marked content will not appear in the exported copy.' : 'Turn on to preview and place redaction marks.'}</p><button onClick={() => setRedactMode(true)} className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-[#8e3928] hover:underline" data-testid="button-review-redactions"><Eye className="size-3.5" /> Review marked regions</button></div><div className="mt-4"><p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Annotations · 03</p>{['Verify source date', 'Name needs context', 'Follow up with Ops'].map((note, index) => <button key={note} className="mb-2 flex w-full items-start gap-2 rounded-md border border-transparent p-2 text-left hover:border-border hover:bg-secondary" data-testid={`button-annotation-${index}`}><MessageSquareText className="mt-0.5 size-3.5 text-primary" /><span className="text-xs">{note}<span className="mt-1 block text-[10px] text-muted-foreground">page {index + 1} · just now</span></span></button>)}</div><button className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border py-2.5 text-xs text-muted-foreground hover:border-primary hover:text-primary" data-testid="button-add-annotation"><Plus className="size-3.5" /> Add annotation</button></div>;
}

function ExtractionPanel({ extraction, setExtraction }: { extraction: string; setExtraction: (value: string) => void }) {
  const extractionOptions = [
    ['table', Table2, 'Table'],
    ['text', AlignLeft, 'Text'],
    ['json', FileJson, 'JSON'],
  ] as const;

  return (
    <div className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-serif text-xl tracking-tight">Extract signal</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Turn selected content into usable data.
          </p>
        </div>
        <Sparkles className="size-5 text-[#b07935]" />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-1 rounded-md bg-secondary p-1">
        {extractionOptions.map(([value, Icon, label]) => (
          <button
            key={value}
            onClick={() => setExtraction(value)}
            className={cx(
              'flex flex-col items-center gap-1 rounded px-1 py-2 text-[10px]',
              extraction === value
                ? 'bg-card font-semibold shadow-sm'
                : 'text-muted-foreground',
            )}
            data-testid={`button-extract-${value}`}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-border bg-[#f6f1e7] p-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-wider text-[#8d6b3c]">
            Preview · {extraction}
          </span>
          <button
            className="text-[#8d6b3c] hover:text-foreground"
            data-testid="button-copy-extraction"
          >
            <Copy className="size-3.5" />
          </button>
        </div>
        {extraction === 'table' ? (
          <div className="overflow-hidden rounded border border-[#ded4c3] bg-card">
            <div className="grid grid-cols-2 border-b border-[#ded4c3] px-2 py-1.5 font-mono text-[9px] text-muted-foreground">
              <span>Theme</span>
              <span>Evidence</span>
            </div>
            {[
              ['Context', '38 interviews'],
              ['Friction', '06 workflows'],
              ['Signal', 'high confidence'],
            ].map(([theme, evidence]) => (
              <div
                key={theme}
                className="grid grid-cols-2 border-b border-[#ded4c3] px-2 py-2 text-[10px] last:border-0"
              >
                <span>{theme}</span>
                <span className="text-muted-foreground">{evidence}</span>
              </div>
            ))}
          </div>
        ) : (
          <pre className="overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[#526068]">
            {extraction === 'json'
              ? `{
  "confidence": "high",
  "evidence": 38,
  "workflows": 6
}`
              : `The useful signal is not louder.
Context is a form of infrastructure.`}
          </pre>
        )}
      </div>
      <button
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2.5 text-xs font-semibold text-primary-foreground hover:brightness-105"
        data-testid="button-save-extraction"
      >
        <Save className="size-3.5" />
        Save extracted {extraction}
      </button>
      <button
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-border py-2 text-xs text-muted-foreground hover-elevate"
        data-testid="button-copy-to-clipboard"
      >
        <Clipboard className="size-3.5" />
        Copy to clipboard
      </button>
    </div>
  );
}

function AssistantPanel({ input, setInput, sent, setSent }: { input: string; setInput: (value: string) => void; sent: boolean; setSent: (value: boolean) => void }) {
  return <div className="flex flex-1 flex-col p-4"><div className="flex items-start gap-2"><div className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"><Bot className="size-4" /></div><div><h2 className="font-serif text-xl tracking-tight">Ask this file</h2><p className="mt-1 text-[11px] text-muted-foreground">A local reading companion, grounded in the active document.</p></div></div><div className="mt-6 space-y-2">{['What is the core recommendation?', 'Show evidence for the confidence rating', 'Find mentions of operating friction'].map((prompt) => <button key={prompt} onClick={() => { setInput(prompt); setSent(true); }} className="w-full rounded-md border border-border p-2.5 text-left text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground" data-testid={`button-prompt-${prompt.slice(0, 8)}`}>{prompt}<ChevronRight className="float-right mt-0.5 size-3.5" /></button>)}</div>{sent && <div className="mt-5 rounded-lg border border-primary/20 bg-primary/[.04] p-3"><div className="flex items-center gap-2 text-[10px] font-semibold text-primary"><Sparkles className="size-3.5" /> Local summary</div><p className="mt-2 font-serif text-sm leading-relaxed text-foreground">The briefing recommends preserving context at the point of work: keep provenance visible, make files searchable, and reduce the handoffs that make decisions disappear.</p><span className="mt-3 block font-mono text-[9px] text-muted-foreground">3 supporting passages · no network used</span></div>}<div className="mt-auto pt-6"><label className="flex items-end gap-2 rounded-lg border border-border bg-background p-2 focus-within:border-primary"><textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask a grounded question…" rows={2} className="min-h-12 flex-1 resize-none bg-transparent px-1 py-1 text-xs outline-none placeholder:text-muted-foreground" data-testid="textarea-assistant" /><button onClick={() => setSent(Boolean(input.trim()))} className="rounded-md bg-primary p-2 text-primary-foreground hover:brightness-105 disabled:opacity-50" disabled={!input.trim()} aria-label="Send question" data-testid="button-send-assistant"><Send className="size-3.5" /></button></label><p className="mt-2 text-center font-mono text-[9px] text-muted-foreground">Runs locally · answers cite the open file</p></div></div>;
}

export default App;