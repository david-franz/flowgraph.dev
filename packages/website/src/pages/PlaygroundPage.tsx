import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { FlowGraphError, buildNavigatorSummary } from '@flowtomic/flowgraph';
import type {
  FlowGraphNavigatorItem,
  FlowGraphNavigatorSummary,
  FlowGraphState,
  GraphNode,
  GraphNodeTemplate,
  GraphPort,
} from '@flowtomic/flowgraph';
import { FlowCanvas, useFlowgraph, type FlowCanvasHandle } from '@flowtomic/flowgraph-react';
import type {
  FlowgraphConnectionValidator,
  FlowgraphRendererOptions,
  FlowgraphRendererSelection,
  FlowgraphRendererTheme,
  FlowgraphRendererViewport,
} from '@flowtomic/flowgraph-core-view';
import styles from '../styles/PlaygroundPage.module.css';

const cloneState = (value: FlowGraphState): FlowGraphState => JSON.parse(JSON.stringify(value));

type MiniMapPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const portPalette = {
  control: '#f97316',
  data: '#38bdf8',
  vector: '#22d3ee',
  text: '#fbbf24',
  llm: '#a855f7',
  error: '#f87171',
} as const;

const portLegend = [
  { id: 'data', label: 'Data stream', color: portPalette.data },
  { id: 'vector', label: 'Vector embedding', color: portPalette.vector },
  { id: 'text', label: 'Prompt / text', color: portPalette.text },
  { id: 'control', label: 'Control flow', color: portPalette.control },
  { id: 'llm', label: 'LLM output', color: portPalette.llm },
  { id: 'error', label: 'Error handling', color: portPalette.error },
];

const colorOptions = portLegend;

type ConnectionPolicy = 'any' | 'match' | 'rules';

type ColorRules = Record<string, Record<string, boolean>>;

const connectionPolicyOptions: Array<{ key: ConnectionPolicy; label: string; description: string }> = [
  {
    key: 'any',
    label: 'Allow any colours',
    description: 'Skip colour-based validation and rely on port capacity alone.',
  },
  {
    key: 'match',
    label: 'Require matching colours',
    description: 'Only ports that share the same colour can connect.',
  },
  {
    key: 'rules',
    label: 'Custom palette rules',
    description: 'Use the matrix below to describe which colours can pair together.',
  },
];

const colorLabelByValue = Object.fromEntries(colorOptions.map(option => [option.color, option.label]));

const createDefaultColorRules = (): ColorRules => {
  const rules: ColorRules = {};
  for (const source of colorOptions) {
    rules[source.color] = {};
    for (const target of colorOptions) {
      rules[source.color][target.color] = source.color === target.color;
    }
  }
  return rules;
};

const createAllowAllColorRules = (): ColorRules => {
  const rules: ColorRules = {};
  for (const source of colorOptions) {
    rules[source.color] = {};
    for (const target of colorOptions) {
      rules[source.color][target.color] = true;
    }
  }
  return rules;
};

const describeColor = (value: string | null | undefined): string => {
  if (!value) {
    return 'uncoloured';
  }
  return colorLabelByValue[value] ?? value;
};

interface TemplatePortDraft {
  id: string;
  label?: string;
  direction: 'input' | 'output';
  color?: string;
  maxConnections: number | null;
  acceptsColors: string[];
  allowAny: boolean;
}

const buildPortDrafts = (template: GraphNodeTemplate<Record<string, unknown>>): TemplatePortDraft[] =>
  template.ports.map(port => ({
    id: port.id,
    label: port.label,
    direction: port.direction,
    color: port.color,
    maxConnections: port.maxConnections ?? null,
    acceptsColors: port.acceptsColors ? [...port.acceptsColors] : [],
    allowAny: !port.acceptsColors || port.acceptsColors.length === 0,
  }));

const templateCategoryOrder = ['Integrations', 'Processing', 'AI', 'Utilities', 'General'] as const;

const nodeTemplateCatalog: GraphNodeTemplate[] = [
  {
    id: 'http-source',
    label: 'HTTP Source',
    description: 'Fetch JSON payloads from an external service.',
    category: 'Integrations',
    ports: [
      { id: 'out', direction: 'output', label: 'Data', color: portPalette.data },
      { id: 'error', direction: 'output', label: 'Error', color: portPalette.error },
    ],
    form: {
      sections: [
        {
          id: 'request',
          title: 'HTTP request',
          fields: [
            {
              id: 'method',
              label: 'Method',
              kind: 'select',
              options: [
                { value: 'GET', label: 'GET' },
                { value: 'POST', label: 'POST' },
                { value: 'PUT', label: 'PUT' },
              ],
              defaultValue: 'GET',
            },
            {
              id: 'url',
              label: 'URL',
              kind: 'text',
              required: true,
              placeholder: 'https://api.example.com/data',
            },
            {
              id: 'headers',
              label: 'Headers (JSON)',
              kind: 'json',
              defaultValue: { Accept: 'application/json' },
            },
          ],
        },
      ],
    },
    defaults: {
      size: { width: 260, height: 200 },
      data: {
        method: 'GET',
        url: 'https://api.example.com/data',
        headers: { Accept: 'application/json' },
      },
      metadata: { icon: 'globe' },
    },
  },
  {
    id: 'json-transform',
    label: 'JSON Transform',
    description: 'Map incoming payloads with a custom expression.',
    category: 'Processing',
    ports: [
      {
        id: 'input',
        direction: 'input',
        label: 'Data',
        color: portPalette.data,
        acceptsColors: [portPalette.data],
        maxConnections: 2,
      },
      { id: 'output', direction: 'output', label: 'Data', color: portPalette.data },
    ],
    form: {
      sections: [
        {
          id: 'mapping',
          title: 'Mapping logic',
          fields: [
            {
              id: 'expression',
              label: 'Expression',
              kind: 'code',
              description: 'Return the object that should flow to the next node.',
              defaultValue: '({ payload }) => ({ ...payload, updatedAt: Date.now() })',
              props: { language: 'javascript', height: 140 },
            },
            {
              id: 'strict',
              label: 'Strict mode',
              kind: 'checkbox',
              defaultValue: true,
              description: 'When enabled, throws if the expression returns null/undefined.',
            },
          ],
        },
      ],
    },
    defaults: {
      size: { width: 260, height: 210 },
      metadata: { icon: 'sparkles' },
      data: {
        expression: '({ payload }) => ({ ...payload, updatedAt: Date.now() })',
        strict: true,
      },
    },
  },
  {
    id: 'vector-embedder',
    label: 'Vector Embedder',
    description: 'Convert text into dense vector embeddings.',
    category: 'AI',
    ports: [
      {
        id: 'text',
        direction: 'input',
        label: 'Text',
        color: portPalette.text,
        acceptsColors: [portPalette.text],
        maxConnections: 3,
      },
      { id: 'vector', direction: 'output', label: 'Vector', color: portPalette.vector },
    ],
    form: {
      sections: [
        {
          id: 'model',
          title: 'Embedding model',
          fields: [
            {
              id: 'modelName',
              label: 'Model',
              kind: 'select',
              options: [
                { value: 'text-embedding-3-large', label: 'text-embedding-3-large' },
                { value: 'text-embedding-3-small', label: 'text-embedding-3-small' },
              ],
              defaultValue: 'text-embedding-3-large',
            },
            {
              id: 'dimensions',
              label: 'Dimensions',
              kind: 'number',
              defaultValue: 1536,
              description: 'Adjust when using custom embedding models.',
            },
          ],
        },
      ],
    },
    defaults: {
      size: { width: 240, height: 200 },
      metadata: { icon: 'sparkles' },
      data: {
        modelName: 'text-embedding-3-large',
        dimensions: 1536,
      },
    },
  },
  {
    id: 'llm-generator',
    label: 'LLM Generator',
    description: 'Combine prompt and retrieved context to produce a response.',
    category: 'AI',
    ports: [
      {
        id: 'prompt',
        direction: 'input',
        label: 'Prompt',
        color: portPalette.text,
        acceptsColors: [portPalette.text],
        maxConnections: 1,
      },
      {
        id: 'context',
        direction: 'input',
        label: 'Context',
        color: portPalette.vector,
        acceptsColors: [portPalette.vector],
        maxConnections: 2,
      },
      { id: 'response', direction: 'output', label: 'Response', color: portPalette.text },
      { id: 'control', direction: 'output', label: 'Next step', color: portPalette.control },
    ],
    form: {
      sections: [
        {
          id: 'generation',
          title: 'Generation settings',
          fields: [
            {
              id: 'model',
              label: 'Model',
              kind: 'select',
              options: [
                { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
                { value: 'gpt-4o', label: 'gpt-4o' },
                { value: 'claude-3.5-sonnet', label: 'claude-3.5-sonnet' },
              ],
              defaultValue: 'gpt-4.1-mini',
            },
            {
              id: 'temperature',
              label: 'Temperature',
              kind: 'number',
              defaultValue: 0.2,
              description: 'Higher values create more diverse responses.',
            },
            {
              id: 'systemPrompt',
              label: 'System prompt',
              kind: 'textarea',
              placeholder: 'You are a helpful assistant...',
            },
          ],
        },
      ],
    },
    defaults: {
      size: { width: 280, height: 240 },
      metadata: { icon: 'sparkles' },
      data: {
        model: 'gpt-4.1-mini',
        temperature: 0.2,
        systemPrompt: '',
      },
    },
  },
];

const graphPresets: Record<string, FlowGraphState> = {
  workflow: {
    nodes: [
      {
        id: 'start',
        label: 'Webhook Trigger',
        position: { x: 120, y: 160 },
        ports: [{ id: 'out', direction: 'output', label: 'next', color: portPalette.control }],
      },
      {
        id: 'router',
        label: 'Branch Logic',
        position: { x: 420, y: 120 },
        ports: [
          {
            id: 'in',
            direction: 'input',
            label: 'entry',
            maxConnections: 1,
            color: portPalette.control,
            acceptsColors: [portPalette.control],
          },
          { id: 'success', direction: 'output', label: 'continue', color: portPalette.data },
          { id: 'fallback', direction: 'output', label: 'fallback', color: portPalette.error },
        ],
      },
      {
        id: 'notify',
        label: 'Notify Customer',
        position: { x: 700, y: 80 },
        ports: [
          {
            id: 'in',
            direction: 'input',
            label: 'payload',
            maxConnections: 1,
            color: portPalette.data,
            acceptsColors: [portPalette.data],
          },
          { id: 'done', direction: 'output', label: 'done', color: portPalette.control },
        ],
      },
      {
        id: 'log',
        label: 'Log Error',
        position: { x: 700, y: 240 },
        ports: [
          {
            id: 'in',
            direction: 'input',
            label: 'failure',
            maxConnections: 4,
            color: portPalette.data,
            acceptsColors: [portPalette.data, portPalette.error, portPalette.control],
          },
        ],
      },
    ],
    connections: [
      { id: 'edge-1', source: { nodeId: 'start', portId: 'out' }, target: { nodeId: 'router', portId: 'in' } },
      { id: 'edge-2', source: { nodeId: 'router', portId: 'success' }, target: { nodeId: 'notify', portId: 'in' } },
      { id: 'edge-3', source: { nodeId: 'router', portId: 'fallback' }, target: { nodeId: 'log', portId: 'in' } },
      { id: 'edge-4', source: { nodeId: 'notify', portId: 'done' }, target: { nodeId: 'log', portId: 'in' } },
    ],
    groups: [],
  },
  uml: {
    nodes: [
      {
        id: 'user',
        label: 'User',
        position: { x: 120, y: 160 },
        ports: [{ id: 'association', direction: 'output', label: 'association', color: portPalette.control }],
        metadata: { stereotype: 'actor' },
      },
      {
        id: 'login',
        label: 'LoginService',
        position: { x: 400, y: 110 },
        ports: [
          {
            id: 'in',
            direction: 'input',
            label: 'uses',
            color: portPalette.control,
            acceptsColors: [portPalette.control],
          },
          { id: 'out', direction: 'output', label: 'calls', color: portPalette.control },
        ],
      },
      {
        id: 'db',
        label: 'AuthStore',
        position: { x: 640, y: 160 },
        ports: [
          {
            id: 'in',
            direction: 'input',
            label: 'queries',
            color: portPalette.control,
            acceptsColors: [portPalette.control],
          },
        ],
      },
    ],
    connections: [
      { id: 'uml-1', source: { nodeId: 'user', portId: 'association' }, target: { nodeId: 'login', portId: 'in' } },
      { id: 'uml-2', source: { nodeId: 'login', portId: 'out' }, target: { nodeId: 'db', portId: 'in' } },
    ],
    groups: [],
  },
  rag: {
    nodes: [
      {
        id: 'retriever',
        label: 'Vector Retriever',
        position: { x: 140, y: 140 },
        ports: [
          {
            id: 'input',
            direction: 'input',
            label: 'query',
            maxConnections: 1,
            color: portPalette.text,
            acceptsColors: [portPalette.text],
          },
          { id: 'docs', direction: 'output', label: 'documents', color: portPalette.data },
        ],
      },
      {
        id: 'ranker',
        label: 'Semantic Ranker',
        position: { x: 440, y: 200 },
        ports: [
          {
            id: 'in',
            direction: 'input',
            label: 'documents',
            maxConnections: 1,
            color: portPalette.data,
            acceptsColors: [portPalette.data],
          },
          { id: 'out', direction: 'output', label: 'top-k', color: portPalette.vector },
        ],
      },
      {
        id: 'llm',
        label: 'LLM Generator',
        position: { x: 720, y: 160 },
        ports: [
          {
            id: 'prompt',
            direction: 'input',
            label: 'prompt',
            maxConnections: 1,
            color: portPalette.text,
            acceptsColors: [portPalette.text],
          },
          {
            id: 'response',
            direction: 'output',
            label: 'answer',
            color: portPalette.text,
          },
        ],
      },
      {
        id: 'eval',
        label: 'Evaluator',
        position: { x: 960, y: 200 },
        ports: [
          {
            id: 'input',
            direction: 'input',
            label: 'answer',
            maxConnections: 1,
            color: portPalette.text,
            acceptsColors: [portPalette.text],
          },
        ],
      },
    ],
    connections: [
      { id: 'rag-1', source: { nodeId: 'retriever', portId: 'docs' }, target: { nodeId: 'ranker', portId: 'in' } },
      { id: 'rag-2', source: { nodeId: 'ranker', portId: 'out' }, target: { nodeId: 'llm', portId: 'prompt' } },
      { id: 'rag-3', source: { nodeId: 'llm', portId: 'response' }, target: { nodeId: 'eval', portId: 'input' } },
    ],
    groups: [],
  },
};

type SettingsTabKey = 'behavior' | 'canvas' | 'connections' | 'layout' | 'theme' | 'templates';

const PlaygroundPage = (): JSX.Element => {
  const { graph, state } = useFlowgraph();
  const canvasRef = useRef<FlowCanvasHandle | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<keyof typeof graphPresets>('workflow');
  const [selection, setSelection] = useState<FlowgraphRendererSelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inspectorExpanded, setInspectorExpanded] = useState(true);
  const [viewport, setViewport] = useState<FlowgraphRendererViewport | null>(null);

  const themePresets: Record<string, FlowgraphRendererTheme> = useMemo(
    () => ({
      midnight: {
        background: '#0f172a',
        nodeFill: '#1e293b',
        nodeStroke: '#334155',
        nodeLabel: '#e2e8f0',
        portFill: '#38bdf8',
        connection: '#38bdf8',
        connectionSelected: '#facc15',
        draft: '#475569',
        miniMapBackground: 'rgba(15, 23, 42, 0.86)',
      },
      aurora: {
        background: '#031022',
        nodeFill: '#13263b',
        nodeStroke: '#1f3b5a',
        nodeLabel: '#dce7ff',
        portFill: '#6ee7b7',
        connection: '#34d399',
        connectionSelected: '#f87171',
        draft: '#1f2937',
        miniMapBackground: 'rgba(12, 24, 43, 0.85)',
      },
      sunrise: {
        background: '#1b0f19',
        nodeFill: '#341b2b',
        nodeStroke: '#48263a',
        nodeLabel: '#ffe5f1',
        portFill: '#f472b6',
        connection: '#fb7185',
        connectionSelected: '#facc15',
        draft: '#c084fc',
        miniMapBackground: 'rgba(32, 14, 30, 0.88)',
      },
    }),
    [],
  );

  const [activePreset, setActivePreset] = useState<string>('midnight');
  const [theme, setTheme] = useState<FlowgraphRendererTheme>(themePresets.midnight);
  const [interactive, setInteractive] = useState(true);
  const [allowZoom, setAllowZoom] = useState(true);
  const [allowPan, setAllowPan] = useState(true);
  const [allowNodeDrag, setAllowNodeDrag] = useState(true);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [miniMapPosition, setMiniMapPosition] = useState<MiniMapPosition>('top-right');
  const [miniMapWidth, setMiniMapWidth] = useState(200);
  const [miniMapHeight, setMiniMapHeight] = useState(140);
  const [connectionArrow, setConnectionArrow] = useState<'arrow' | 'circle' | 'none'>('arrow');
  const [preventSelfConnections, setPreventSelfConnections] = useState(true);
  const [connectionPolicy, setConnectionPolicy] = useState<ConnectionPolicy>('match');
  const [colorRules, setColorRules] = useState<ColorRules>(() => createDefaultColorRules());
  const [showNavigator, setShowNavigator] = useState(true);
  const [navigatorExpanded, setNavigatorExpanded] = useState(true);
  const [nodeWidth, setNodeWidth] = useState(220);
  const [nodeHeight, setNodeHeight] = useState(160);
  const [nodeCornerRadius, setNodeCornerRadius] = useState(16);
  const [portSpacing, setPortSpacing] = useState(28);
  const [portRegionPadding, setPortRegionPadding] = useState(52);
  const [showGrid, setShowGrid] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [gridSize, setGridSize] = useState(32);
  const [syncViewport, setSyncViewport] = useState(true);
  const [connectionMinControlDistance, setConnectionMinControlDistance] = useState(80);
  const [zoomMin, setZoomMin] = useState(0.3);
  const [zoomMax, setZoomMax] = useState(2.5);
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTabKey>('behavior');
  const historyRef = useRef<FlowGraphState[]>([]);
  const historyIndexRef = useRef(-1);
  const isApplyingHistoryRef = useRef(false);
  const [historyAvailability, setHistoryAvailability] = useState({ canUndo: false, canRedo: false });
  const templatesRegisteredRef = useRef(false);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [nodeLabelOverride, setNodeLabelOverride] = useState('');
  const [nodeReadonly, setNodeReadonly] = useState(false);
  const [templateDataJson, setTemplateDataJson] = useState('{}');
  const [portDrafts, setPortDrafts] = useState<TemplatePortDraft[]>([]);
  const lastTemplateInitialisedRef = useRef<string | null>(null);

  const stateJson = useMemo(() => JSON.stringify(state, null, 2), [state]);
  const navigatorSummary = useMemo((): FlowGraphNavigatorSummary => buildNavigatorSummary(state), [state]);
  const templates = state.templates ?? [];
  const templateGroups = useMemo(() => {
    if (templates.length === 0) {
      return [] as Array<{ category: string; templates: GraphNodeTemplate[] }>;
    }
    const grouped = new Map<string, GraphNodeTemplate[]>();
    for (const template of templates) {
      const category = template.category ?? 'General';
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(template);
    }
    return Array.from(grouped.entries())
      .sort((a, b) => {
        const indexA = templateCategoryOrder.indexOf(a[0] as (typeof templateCategoryOrder)[number]);
        const indexB = templateCategoryOrder.indexOf(b[0] as (typeof templateCategoryOrder)[number]);
        const safeA = indexA === -1 ? templateCategoryOrder.length : indexA;
        const safeB = indexB === -1 ? templateCategoryOrder.length : indexB;
        if (safeA === safeB) {
          return a[0].localeCompare(b[0]);
        }
        return safeA - safeB;
      })
      .map(([category, result]) => ({
        category,
        templates: result.sort((a, b) => a.label.localeCompare(b.label)),
      }));
  }, [templates]);

  const activeTemplate = useMemo(
    () => (activeTemplateId ? templates.find(template => template.id === activeTemplateId) ?? null : null),
    [templates, activeTemplateId],
  );

  const initialiseTemplateDraft = useCallback(
    (template: GraphNodeTemplate<Record<string, unknown>>) => {
      lastTemplateInitialisedRef.current = template.id;
      setNodeLabelOverride(template.defaults?.label ?? template.label ?? template.id);
      setNodeReadonly(template.defaults?.readonly ?? false);
      setTemplateDataJson(
        template.defaults?.data ? JSON.stringify(template.defaults.data, null, 2) : JSON.stringify({}, null, 2),
      );
      setPortDrafts(buildPortDrafts(template));
    },
    [],
  );

  useEffect(() => {
    if (!activeTemplateId && templates.length > 0) {
      setActiveTemplateId(templates[0].id);
    }
  }, [activeTemplateId, templates]);

  useEffect(() => {
    if (!activeTemplate) {
      return;
    }
    if (lastTemplateInitialisedRef.current === activeTemplate.id) {
      return;
    }
    initialiseTemplateDraft(activeTemplate);
  }, [activeTemplate, initialiseTemplateDraft]);

  const syncHistoryAvailability = useCallback(() => {
    setHistoryAvailability({
      canUndo: historyIndexRef.current > 0,
      canRedo: historyIndexRef.current < historyRef.current.length - 1,
    });
  }, []);

  useEffect(() => {
    historyRef.current = [cloneState(graph.getState())];
    historyIndexRef.current = 0;
    syncHistoryAvailability();
  }, [graph, syncHistoryAvailability]);

  useEffect(() => {
    if (templatesRegisteredRef.current) {
      return;
    }
    nodeTemplateCatalog.forEach(template => {
      try {
        if (graph.getTemplate(template.id)) {
          graph.updateTemplate(template.id, template);
        } else {
          graph.registerTemplate(template);
        }
      } catch (err) {
        if (err instanceof FlowGraphError && err.code === 'TEMPLATE_EXISTS') {
          graph.updateTemplate(template.id, template);
        } else {
          // eslint-disable-next-line no-console
          console.warn('[Playground] Failed to register template', err);
        }
      }
    });
    templatesRegisteredRef.current = true;
  }, [graph]);

  useEffect(() => {
    if (isApplyingHistoryRef.current) {
      isApplyingHistoryRef.current = false;
      syncHistoryAvailability();
      return;
    }
    const snapshot = cloneState(state);
    const history = historyRef.current;
    const currentIndex = historyIndexRef.current;
    const last = history[currentIndex];
    if (last && JSON.stringify(last) === JSON.stringify(snapshot)) {
      return;
    }
    history.splice(currentIndex + 1);
    history.push(snapshot);
    historyIndexRef.current = history.length - 1;
    if (history.length > 100) {
      history.shift();
      historyIndexRef.current = history.length - 1;
    }
    syncHistoryAvailability();
  }, [state, syncHistoryAvailability]);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) {
      return;
    }
    historyIndexRef.current -= 1;
    const snapshot = historyRef.current[historyIndexRef.current];
    if (!snapshot) {
      historyIndexRef.current += 1;
      return;
    }
    isApplyingHistoryRef.current = true;
    graph.importState(cloneState(snapshot));
    syncHistoryAvailability();
  }, [graph, syncHistoryAvailability]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) {
      return;
    }
    historyIndexRef.current += 1;
    const snapshot = historyRef.current[historyIndexRef.current];
    if (!snapshot) {
      historyIndexRef.current -= 1;
      return;
    }
    isApplyingHistoryRef.current = true;
    graph.importState(cloneState(snapshot));
    syncHistoryAvailability();
  }, [graph, syncHistoryAvailability]);

  const applyThemePreset = useCallback(
    (presetKey: keyof typeof themePresets) => {
      setActivePreset(presetKey);
      setTheme(themePresets[presetKey]);
    },
    [themePresets],
  );

  const handleNodeSelect = useCallback((node: { id: string }) => {
    setSelection({ nodeId: node.id, connectionId: null });
    setError(null);
  }, []);

  const handleConnectionSelect = useCallback((connection: { id: string }) => {
    setSelection({ nodeId: null, connectionId: connection.id });
    setError(null);
  }, []);

  const handleConnectionCreate = useCallback((connection: { id: string }) => {
    setSelection({ nodeId: null, connectionId: connection.id });
    setError(null);
  }, []);

  const handleConnectionError = useCallback((err: unknown) => {
    const message = err instanceof FlowGraphError ? err.message : String(err);
    setError(message);
  }, []);

  const validateConnection = useCallback<FlowgraphConnectionValidator<Record<string, unknown>>>(
    (source, target, currentGraph) => {
      if (preventSelfConnections && source.nodeId === target.nodeId) {
        return 'Self connections are disabled in this playground.';
      }

      if (connectionPolicy === 'any') {
        return true;
      }

      const sourceNode = currentGraph.getNode(source.nodeId);
      const targetNode = currentGraph.getNode(target.nodeId);
      const sourcePort = sourceNode?.ports.find(port => port.id === source.portId);
      const targetPort = targetNode?.ports.find(port => port.id === target.portId);
      const sourceColor = sourcePort?.color ?? null;
      const targetColor = targetPort?.color ?? null;

      if (connectionPolicy === 'match') {
        if (sourceColor && targetColor && sourceColor !== targetColor) {
          return `Only matching colours can connect. ${describeColor(sourceColor)} → ${describeColor(targetColor)} was blocked.`;
        }
        return true;
      }

      if (!sourceColor || !targetColor) {
        return true;
      }

      const allowed = Boolean(colorRules[sourceColor]?.[targetColor]);
      if (!allowed) {
        const fromLabel = describeColor(sourceColor);
        const toLabel = describeColor(targetColor);
        return `${fromLabel} cannot connect to ${toLabel} under the current rule set.`;
      }
      return true;
    },
    [preventSelfConnections, connectionPolicy, colorRules],
  );

  const rendererOptions: FlowgraphRendererOptions = useMemo(() => {
    const minZoom = Math.max(0.05, Math.min(zoomMin, zoomMax));
    const maxZoom = Math.max(minZoom + 0.05, Math.max(zoomMin, zoomMax));
    const normalizedGridSize = Math.max(4, gridSize);
    const normalizedMiniMapWidth = Math.max(120, miniMapWidth);
    const normalizedMiniMapHeight = Math.max(80, miniMapHeight);
    const controlDistance = Math.max(24, connectionMinControlDistance);
    const shouldAttachValidator = preventSelfConnections || connectionPolicy !== 'any';

    return {
      nodeSize: { width: nodeWidth, height: nodeHeight },
      nodeCornerRadius,
      portSpacing,
      portRegionPadding,
      interactive,
      allowZoom,
      allowPan,
      allowNodeDrag,
      syncViewport,
      showMiniMap,
      miniMapPosition,
      miniMapSize: { width: normalizedMiniMapWidth, height: normalizedMiniMapHeight },
      connectionArrow,
      showGrid,
      gridSize: normalizedGridSize,
      snapToGrid,
      connectionMinControlDistance: controlDistance,
      zoomExtent: [minZoom, maxZoom],
      theme,
      validateConnection: shouldAttachValidator ? validateConnection : undefined,
      onNodeSelect: handleNodeSelect,
      onConnectionSelect: handleConnectionSelect,
      onConnectionCreate: handleConnectionCreate,
      onConnectionError: handleConnectionError,
      onViewportChange: next => setViewport(next),
    };
  }, [
    nodeWidth,
    nodeHeight,
    nodeCornerRadius,
    portSpacing,
    portRegionPadding,
    interactive,
    allowZoom,
    allowPan,
    allowNodeDrag,
    syncViewport,
    showMiniMap,
    miniMapPosition,
    miniMapWidth,
    miniMapHeight,
    connectionArrow,
    showGrid,
    gridSize,
    snapToGrid,
    connectionMinControlDistance,
    zoomMin,
    zoomMax,
    theme,
    validateConnection,
    preventSelfConnections,
    connectionPolicy,
    handleNodeSelect,
    handleConnectionSelect,
    handleConnectionCreate,
    handleConnectionError,
  ]);

  const spawnNodeFromTemplate = useCallback(
    (
      templateId: string,
      overrides: Partial<Omit<GraphNode<Record<string, unknown>>, 'id'>> = {},
    ) => {
      try {
        const basePosition = viewport
          ? {
              x: viewport.position.x + 160 + Math.random() * 80,
              y: viewport.position.y + 140 + Math.random() * 80,
            }
          : { x: 200 + Math.random() * 120, y: 160 + Math.random() * 120 };
        const node = graph.addNodeFromTemplate(templateId, {
          ...overrides,
          position: overrides.position ?? basePosition,
        });
        setSelection({ nodeId: node.id, connectionId: null });
        setError(null);
        requestAnimationFrame(() => {
          canvasRef.current?.getRenderer()?.focusNode(node.id);
        });
      } catch (err) {
        setError(err instanceof FlowGraphError ? err.message : String(err));
      }
    },
    [graph, viewport],
  );

  const applyTemplate = useCallback(
    (templateKey: keyof typeof graphPresets) => {
      const template = graphPresets[templateKey];
      graph.importState(template);
      setSelectedTemplate(templateKey);
      setSelection({ nodeId: template.nodes[0]?.id ?? null, connectionId: null });
      setError(null);
      requestAnimationFrame(() => {
        const firstNodeId = template.nodes[0]?.id;
        if (firstNodeId) {
          canvasRef.current?.getRenderer()?.focusNode(firstNodeId);
        }
      });
    },
    [graph],
  );

  useEffect(() => {
    if (state.nodes.length === 0) {
      applyTemplate('workflow');
    }
  }, [applyTemplate, state.nodes.length]);

  useEffect(() => {
    if (!showGrid) {
      setSnapToGrid(false);
    }
  }, [showGrid]);

  useEffect(() => {
    if (!showNavigator) {
      setNavigatorExpanded(false);
    }
  }, [showNavigator]);

  const settingsTabs = useMemo(
    () => [
      { key: 'behavior', label: 'Behavior' },
      { key: 'canvas', label: 'Canvas' },
      { key: 'connections', label: 'Connections' },
      { key: 'layout', label: 'Layout' },
      { key: 'theme', label: 'Theme' },
      { key: 'templates', label: 'Templates' },
    ],
    [],
  );

  const behaviorTabContent = (
    <>
      <div className={styles.controlGroup}>
        <span className={styles.groupLabel}>Interactions</span>
        <label className={styles.toggleRow}>
          <span>Interactive canvas</span>
          <input type="checkbox" checked={interactive} onChange={event => setInteractive(event.target.checked)} />
        </label>
        <label className={styles.toggleRow}>
          <span>Allow zoom</span>
          <input
            type="checkbox"
            checked={allowZoom}
            disabled={!interactive}
            onChange={event => setAllowZoom(event.target.checked)}
          />
        </label>
        <label className={styles.toggleRow}>
          <span>Allow pan</span>
          <input
            type="checkbox"
            checked={allowPan}
            disabled={!interactive}
            onChange={event => setAllowPan(event.target.checked)}
          />
        </label>
        <label className={styles.toggleRow}>
          <span>Allow node drag</span>
          <input
            type="checkbox"
            checked={allowNodeDrag}
            disabled={!interactive}
            onChange={event => setAllowNodeDrag(event.target.checked)}
          />
        </label>
      </div>
      <div className={styles.controlGroup}>
        <span className={styles.groupLabel}>State</span>
        <label className={styles.toggleRow}>
          <span>Sync viewport to graph state</span>
          <input
            type="checkbox"
            checked={syncViewport}
            onChange={event => setSyncViewport(event.target.checked)}
          />
        </label>
        <label className={styles.toggleRow}>
          <span>Show navigator panel</span>
          <input
            type="checkbox"
            checked={showNavigator}
            onChange={event => {
              const checked = event.target.checked;
              setShowNavigator(checked);
              if (checked) {
                setNavigatorExpanded(true);
              }
            }}
          />
        </label>
      </div>
    </>
  );

  const canvasTabContent = (
    <>
      <div className={styles.controlGroup}>
        <span className={styles.groupLabel}>Minimap</span>
        <label className={styles.toggleRow}>
          <span>Show minimap</span>
          <input type="checkbox" checked={showMiniMap} onChange={event => setShowMiniMap(event.target.checked)} />
        </label>
        <label className={styles.controlLabel} htmlFor="minimap-position">
          Position
          <select
            id="minimap-position"
            value={miniMapPosition}
            disabled={!showMiniMap}
            onChange={event => setMiniMapPosition(event.target.value as MiniMapPosition)}
          >
            <option value="top-left">Top left</option>
            <option value="top-right">Top right</option>
            <option value="bottom-left">Bottom left</option>
            <option value="bottom-right">Bottom right</option>
          </select>
        </label>
        <div className={styles.inlineInputs}>
          <label>
            Width
            <input
              type="number"
              min={120}
              max={360}
              value={miniMapWidth}
              disabled={!showMiniMap}
              onChange={event => setMiniMapWidth(Number(event.target.value) || 0)}
            />
          </label>
          <label>
            Height
            <input
              type="number"
              min={80}
              max={280}
              value={miniMapHeight}
              disabled={!showMiniMap}
              onChange={event => setMiniMapHeight(Number(event.target.value) || 0)}
            />
          </label>
        </div>
      </div>
      <div className={styles.controlGroup}>
        <span className={styles.groupLabel}>Grid &amp; zoom</span>
        <label className={styles.toggleRow}>
          <span>Show grid</span>
          <input type="checkbox" checked={showGrid} onChange={event => setShowGrid(event.target.checked)} />
        </label>
        <label className={styles.toggleRow}>
          <span>Snap to grid</span>
          <input
            type="checkbox"
            checked={snapToGrid}
            disabled={!showGrid}
            onChange={event => setSnapToGrid(event.target.checked)}
          />
        </label>
        <div className={styles.inlineInputs}>
          <label>
            Grid size
            <input
              type="number"
              min={4}
              max={128}
              value={gridSize}
              disabled={!showGrid}
              onChange={event => setGridSize(Number(event.target.value) || 0)}
            />
          </label>
          <label>
            Zoom min
            <input
              type="number"
              min={0.05}
              max={zoomMax}
              step={0.05}
              value={zoomMin}
              onChange={event => setZoomMin(Number(event.target.value) || 0)}
            />
          </label>
          <label>
            Zoom max
            <input
              type="number"
              min={zoomMin}
              max={8}
              step={0.05}
              value={zoomMax}
              onChange={event => setZoomMax(Number(event.target.value) || 0)}
            />
          </label>
        </div>
      </div>
    </>
  );

  const handleToggleColorRule = useCallback((sourceColor: string, targetColor: string) => {
    setColorRules(prev => {
      const next: ColorRules = { ...prev };
      if (!next[sourceColor]) {
        next[sourceColor] = {};
      }
      next[sourceColor] = { ...next[sourceColor], [targetColor]: !prev[sourceColor]?.[targetColor] };
      return next;
    });
  }, []);

  const handleResetColorRules = useCallback(() => {
    setColorRules(createDefaultColorRules());
  }, []);

  const handleAllowAllColorRules = useCallback(() => {
    setColorRules(createAllowAllColorRules());
  }, []);

  const connectionsTabContent = (
    <>
      <div className={styles.controlGroup}>
        <span className={styles.groupLabel}>Rendering</span>
        <label className={styles.controlLabel} htmlFor="arrow-select">
          Connection arrow
          <select
            id="arrow-select"
            value={connectionArrow}
            onChange={event => setConnectionArrow(event.target.value as 'arrow' | 'circle' | 'none')}
          >
            <option value="arrow">Arrow</option>
            <option value="circle">Circle</option>
            <option value="none">None</option>
          </select>
        </label>
        <div className={styles.inlineInputs}>
          <label>
            Bezier control distance
            <input
              type="number"
              min={24}
              max={360}
              value={connectionMinControlDistance}
              onChange={event => setConnectionMinControlDistance(Number(event.target.value) || 0)}
            />
          </label>
        </div>
      </div>
      <div className={styles.controlGroup}>
        <span className={styles.groupLabel}>Validation</span>
        <label className={styles.toggleRow}>
          <span>Prevent self connections</span>
          <input
            type="checkbox"
            checked={preventSelfConnections}
            onChange={event => setPreventSelfConnections(event.target.checked)}
          />
        </label>
        <div className={styles.radioGroup}>
          {connectionPolicyOptions.map(option => (
            <label key={option.key} className={styles.radioRow}>
              <input
                type="radio"
                name="connection-policy"
                value={option.key}
                checked={connectionPolicy === option.key}
                onChange={() => setConnectionPolicy(option.key)}
              />
              <span>
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </span>
            </label>
          ))}
        </div>
        {connectionPolicy === 'rules' ? (
          <div className={styles.ruleMatrix}>
            <table>
              <thead>
                <tr>
                  <th>Source → Target</th>
                  {colorOptions.map(target => (
                    <th key={target.id}>
                      <span className={styles.colorChip} style={{ background: target.color }} />
                      {target.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {colorOptions.map(source => (
                  <tr key={source.id}>
                    <th>
                      <span className={styles.colorChip} style={{ background: source.color }} />
                      {source.label}
                    </th>
                    {colorOptions.map(target => {
                      const checked = Boolean(colorRules[source.color]?.[target.color]);
                      return (
                        <td key={target.id}>
                          <input
                            type="checkbox"
                            aria-label={`${source.label} to ${target.label}`}
                            checked={checked}
                            onChange={() => handleToggleColorRule(source.color, target.color)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={styles.ruleMatrixActions}>
              <button type="button" onClick={handleAllowAllColorRules}>
                Allow all pairings
              </button>
              <button type="button" onClick={handleResetColorRules}>
                Reset to defaults
              </button>
            </div>
            <p className={styles.hint}>Unchecked cells block the corresponding colour pairing.</p>
          </div>
        ) : null}
      </div>
    </>
  );

  const layoutTabContent = (
    <>
      <div className={styles.controlGroup}>
        <span className={styles.groupLabel}>Node geometry</span>
        <div className={styles.inlineInputs}>
          <label>
            Width
            <input
              type="number"
              min={140}
              max={400}
              value={nodeWidth}
              onChange={event => setNodeWidth(Number(event.target.value) || 0)}
            />
          </label>
          <label>
            Height
            <input
              type="number"
              min={120}
              max={320}
              value={nodeHeight}
              onChange={event => setNodeHeight(Number(event.target.value) || 0)}
            />
          </label>
          <label>
            Corner radius
            <input
              type="number"
              min={0}
              max={42}
              value={nodeCornerRadius}
              onChange={event => setNodeCornerRadius(Number(event.target.value) || 0)}
            />
          </label>
        </div>
      </div>
      <div className={styles.controlGroup}>
        <span className={styles.groupLabel}>Ports</span>
        <div className={styles.inlineInputs}>
          <label>
            Port spacing
            <input
              type="number"
              min={18}
              max={72}
              value={portSpacing}
              onChange={event => setPortSpacing(Number(event.target.value) || 0)}
            />
          </label>
          <label>
            Port offset
            <input
              type="number"
              min={24}
              max={120}
              value={portRegionPadding}
              onChange={event => setPortRegionPadding(Number(event.target.value) || 0)}
            />
          </label>
        </div>
      </div>
    </>
  );

  const themePresetEntries = useMemo(() => Object.entries(themePresets), [themePresets]);

  const themeTabContent = (
    <>
      <div className={styles.controlGroup}>
        <span className={styles.groupLabel}>Presets</span>
        <div className={styles.themePresetList}>
          {themePresetEntries.map(([key, preset]) => (
            <button
              key={key}
              type="button"
              className={styles.themePresetButton}
              data-active={activePreset === key ? 'true' : 'false'}
              style={{ background: preset.background }}
              onClick={() => applyThemePreset(key as keyof typeof themePresets)}
            >
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </button>
          ))}
          <button
            type="button"
            className={styles.themePresetButton}
            data-active={activePreset === 'custom' ? 'true' : 'false'}
            onClick={() => setActivePreset('custom')}
          >
            Custom
          </button>
        </div>
        <label className={styles.controlLabel} htmlFor="theme-preset">
          Preset (dropdown)
          <select
            id="theme-preset"
            value={activePreset in themePresets ? activePreset : 'custom'}
            onChange={event => {
              const value = event.target.value;
              if (value in themePresets) {
                applyThemePreset(value as keyof typeof themePresets);
              } else {
                setActivePreset('custom');
              }
            }}
          >
            {Object.keys(themePresets).map(key => (
              <option key={key} value={key}>
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </label>
      </div>
      <div className={styles.controlGroup}>
        <span className={styles.groupLabel}>Token colours</span>
        <div className={styles.themeGrid}>
          {(
            [
              { key: 'background', label: 'Canvas' },
              { key: 'nodeFill', label: 'Node fill' },
              { key: 'nodeStroke', label: 'Node stroke' },
              { key: 'nodeLabel', label: 'Node label' },
              { key: 'portFill', label: 'Port' },
              { key: 'connection', label: 'Connection' },
              { key: 'connectionSelected', label: 'Selection' },
              { key: 'draft', label: 'Draft' },
            ] as Array<{ key: keyof FlowgraphRendererTheme; label: string }>
          ).map(field => (
            <label key={field.key} className={styles.colorField}>
              <span>{field.label}</span>
              <input
                type="color"
                value={theme[field.key].startsWith('#') ? theme[field.key] : '#000000'}
                onChange={event => {
                  const value = event.target.value;
                  setTheme(prev => ({ ...prev, [field.key]: value }));
                  setActivePreset('custom');
                }}
              />
            </label>
          ))}
        </div>
        <label className={styles.controlLabel} htmlFor="minimap-background">
          Minimap background (supports rgba)
          <input
            id="minimap-background"
            type="text"
            value={theme.miniMapBackground}
            onChange={event => {
              const value = event.target.value;
              setTheme(prev => ({ ...prev, miniMapBackground: value }));
              setActivePreset('custom');
            }}
            placeholder="rgba(15, 23, 42, 0.86)"
          />
        </label>
      </div>
    </>
  );

  const handleTemplateMaxConnectionsChange = useCallback((portId: string, value: string) => {
    setPortDrafts(prev =>
      prev.map(port => {
        if (port.id !== portId) {
          return port;
        }
        const parsed = value.trim() === '' ? null : Math.max(0, Number(value));
        return { ...port, maxConnections: Number.isNaN(parsed) ? port.maxConnections : parsed };
      }),
    );
  }, []);

  const handleTemplateAllowAnyChange = useCallback((portId: string, allowAny: boolean) => {
    setPortDrafts(prev =>
      prev.map(port => (port.id === portId ? { ...port, allowAny, acceptsColors: allowAny ? [] : port.acceptsColors } : port)),
    );
  }, []);

  const handleTemplateColorToggle = useCallback((portId: string, color: string) => {
    setPortDrafts(prev =>
      prev.map(port => {
        if (port.id !== portId) {
          return port;
        }
        const next = new Set(port.acceptsColors);
        if (next.has(color)) {
          next.delete(color);
        } else {
          next.add(color);
        }
        return { ...port, acceptsColors: Array.from(next) };
      }),
    );
  }, []);

  const handleTemplateSpawn = useCallback(() => {
    if (!activeTemplate) {
      setError('Select a template to configure.');
      return;
    }
    let parsedData: Record<string, unknown> | undefined;
    try {
      const trimmed = templateDataJson.trim();
      if (trimmed.length === 0) {
        parsedData = undefined;
      } else {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          parsedData = parsed as Record<string, unknown>;
        } else {
          throw new Error('Node data must be an object.');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse node data JSON.');
      return;
    }

    const resolvedPorts = portDrafts.map(draft => {
      const basePort = activeTemplate.ports.find(port => port.id === draft.id);
      if (!basePort) {
        return null;
      }
      const nextPort: GraphPort = {
        ...basePort,
        maxConnections: draft.maxConnections ?? undefined,
        acceptsColors: draft.allowAny ? undefined : [...draft.acceptsColors],
      };
      return nextPort;
    });

    if (resolvedPorts.some(port => port === null)) {
      setError('Template ports are out of sync. Reset to defaults and try again.');
      return;
    }

    const finalPorts = resolvedPorts.filter((port): port is GraphPort => Boolean(port));

    spawnNodeFromTemplate(activeTemplate.id, {
      label: nodeLabelOverride.trim() ? nodeLabelOverride.trim() : undefined,
      readonly: nodeReadonly,
      data: parsedData,
      ports: finalPorts,
    });
    setError(null);
  }, [activeTemplate, nodeLabelOverride, nodeReadonly, portDrafts, spawnNodeFromTemplate, templateDataJson]);

  const handleTemplateReset = useCallback(() => {
    if (activeTemplate) {
      initialiseTemplateDraft(activeTemplate);
    }
  }, [activeTemplate, initialiseTemplateDraft]);

  const templatesTabContent = (
    <>
      <div className={styles.controlGroup}>
        <span className={styles.groupLabel}>Library</span>
        {templateGroups.length === 0 ? (
          <p className={styles.templatesEmpty}>Templates load automatically once the graph initialises.</p>
        ) : (
          templateGroups.map(group => (
            <div key={group.category} className={styles.templateGroup}>
              <div className={styles.templateGroupHeader}>
                <span>{group.category}</span>
                <span className={styles.templateCount}>{group.templates.length}</span>
              </div>
              <div className={styles.templateGrid}>
                {group.templates.map(template => (
                  <button
                    key={template.id}
                    type="button"
                    className={styles.templateButton}
                    onClick={() => spawnNodeFromTemplate(template.id)}
                  >
                    <span className={styles.templateButtonLabel}>{template.label}</span>
                    {template.description ? (
                      <span className={styles.templateButtonDescription}>{template.description}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
        <div className={styles.portLegend}>
          {portLegend.map(item => (
            <span key={item.id} className={styles.portLegendItem}>
              <span className={styles.portLegendSwatch} style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
      {activeTemplate ? (
        <div className={styles.controlGroup}>
          <span className={styles.groupLabel}>Custom node builder</span>
          <label className={styles.controlLabel} htmlFor="template-select-editor">
            Working template
            <select
              id="template-select-editor"
              value={activeTemplateId ?? ''}
              onChange={event => {
                const value = event.target.value;
                setActiveTemplateId(value || null);
                if (value) {
                  lastTemplateInitialisedRef.current = null;
                }
              }}
            >
              {templates.map(template => (
                <option key={template.id} value={template.id}>
                  {template.label}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.inlineInputs}>
            <label>
              Node label
              <input
                type="text"
                value={nodeLabelOverride}
                onChange={event => setNodeLabelOverride(event.target.value)}
              />
            </label>
            <label className={styles.toggleRow}>
              <span>Readonly</span>
              <input
                type="checkbox"
                checked={nodeReadonly}
                onChange={event => setNodeReadonly(event.target.checked)}
              />
            </label>
          </div>
          <label className={styles.controlLabel} htmlFor="template-data-json">
            Node data override (JSON object)
            <textarea
              id="template-data-json"
              value={templateDataJson}
              onChange={event => setTemplateDataJson(event.target.value)}
              rows={6}
            />
          </label>
          <div className={styles.portDraftList}>
            {portDrafts.map(port => (
              <div key={port.id} className={styles.portDraftCard}>
                <div className={styles.portDraftMeta}>
                  <span className={styles.portDraftTitle}>{port.label ?? port.id}</span>
                  <span className={styles.portDraftBadge}>{port.direction === 'input' ? 'Input' : 'Output'}</span>
                  {port.color ? <span className={styles.colorChip} style={{ background: port.color }} /> : null}
                </div>
                <div className={styles.inlineInputs}>
                  <label>
                    Max connections
                    <input
                      type="number"
                      min={0}
                      value={port.maxConnections ?? ''}
                      placeholder="∞"
                      onChange={event => handleTemplateMaxConnectionsChange(port.id, event.target.value)}
                    />
                  </label>
                  <label className={styles.toggleRow}>
                    <span>Allow any colour</span>
                    <input
                      type="checkbox"
                      checked={port.allowAny}
                      onChange={event => handleTemplateAllowAnyChange(port.id, event.target.checked)}
                    />
                  </label>
                </div>
                {!port.allowAny ? (
                  <div className={styles.checkboxGrid}>
                    {colorOptions.map(color => (
                      <label key={color.id}>
                        <input
                          type="checkbox"
                          checked={port.acceptsColors.includes(color.color)}
                          onChange={() => handleTemplateColorToggle(port.id, color.color)}
                        />
                        <span className={styles.colorChip} style={{ background: color.color }} />
                        {color.label}
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className={styles.templateActions}>
            <button type="button" onClick={handleTemplateSpawn}>
              Spawn node with overrides
            </button>
            <button type="button" onClick={handleTemplateReset}>
              Reset builder
            </button>
          </div>
        </div>
      ) : (
        <p className={styles.templatesEmpty}>Select a template to configure node overrides.</p>
      )}
    </>
  );

  const tabContent: Record<SettingsTabKey, JSX.Element> = {
    behavior: behaviorTabContent,
    canvas: canvasTabContent,
    connections: connectionsTabContent,
    layout: layoutTabContent,
    theme: themeTabContent,
    templates: templatesTabContent,
  };

  const clearSelection = useCallback(() => {
    setSelection({ nodeId: null, connectionId: null });
  }, []);

  const deleteSelection = useCallback(() => {
    if (selection?.connectionId) {
      try {
        graph.removeConnection(selection.connectionId);
        clearSelection();
      } catch (err) {
        setError(err instanceof FlowGraphError ? err.message : String(err));
      }
      return;
    }
    if (selection?.nodeId) {
      try {
        graph.removeNode(selection.nodeId);
        clearSelection();
      } catch (err) {
        setError(err instanceof FlowGraphError ? err.message : String(err));
      }
    }
  }, [graph, selection, clearSelection]);

  const handleNavigatorItemClick = useCallback(
    (item: FlowGraphNavigatorItem) => {
      setError(null);
      if (item.kind === 'node') {
        setSelection({ nodeId: item.id, connectionId: null });
        requestAnimationFrame(() => {
          canvasRef.current?.getRenderer()?.focusNode(item.id);
        });
        return;
      }
      if (item.kind === 'connection') {
        setSelection({ nodeId: null, connectionId: item.id });
        return;
      }
      if (item.kind === 'group') {
        const current = graph.getState();
        const targetGroup = current.groups.find(group => group.id === item.id);
        const firstNodeId = targetGroup?.nodeIds[0];
        if (firstNodeId) {
          setSelection({ nodeId: firstNodeId, connectionId: null });
          requestAnimationFrame(() => {
            canvasRef.current?.getRenderer()?.focusNode(firstNodeId);
          });
        }
      }
    },
    [graph],
  );

  return (
    <div className={styles.playground}>
      <main className={styles.stage} data-has-navigator={showNavigator ? 'true' : 'false'}>
        <div className={styles.canvasShell}>
          <div className={styles.canvasWrapper}>
            <FlowCanvas
              ref={canvasRef}
              graph={graph}
              rendererOptions={rendererOptions}
              selection={selection ?? undefined}
            />
          </div>
          <section className={styles.inspector} data-expanded={inspectorExpanded ? 'true' : 'false'}>
            <header>
              <span>Graph state</span>
              <div className={styles.inspectorControls}>
                <button type="button" onClick={() => setInspectorExpanded(value => !value)}>
                  {inspectorExpanded ? 'Collapse' : 'Expand'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(stateJson).catch(() => {});
                  }}
                >
                  Copy
                </button>
              </div>
            </header>
            {inspectorExpanded ? <pre>{stateJson}</pre> : null}
          </section>
          {error ? <p className={styles.error}>{error}</p> : null}
        </div>
        {showNavigator ? (
          <section className={styles.navigator} data-expanded={navigatorExpanded ? 'true' : 'false'}>
            <header>
              <span>Navigator</span>
              <div className={styles.navigatorControls}>
                <span className={styles.navigatorTotalsLabel}>
                  {navigatorSummary.totals.nodes} nodes · {navigatorSummary.totals.connections} connections ·{' '}
                  {navigatorSummary.totals.groups} groups
                </span>
                <button type="button" onClick={() => setNavigatorExpanded(value => !value)}>
                  {navigatorExpanded ? 'Collapse' : 'Expand'}
                </button>
              </div>
            </header>
            {navigatorExpanded ? (
              <div className={styles.navigatorSections}>
                {navigatorSummary.sections.map(section => (
                  <div key={section.id} className={styles.navigatorSection}>
                    <div className={styles.navigatorSectionHeader}>
                      <span>{section.label}</span>
                      <span className={styles.navigatorBadge}>{section.items.length}</span>
                    </div>
                    <ul className={styles.navigatorItems}>
                      {section.items.length === 0 ? (
                        <li className={styles.navigatorEmpty}>Empty</li>
                      ) : (
                        section.items.map(item => {
                          const isActive =
                            (item.kind === 'node' && selection?.nodeId === item.id) ||
                            (item.kind === 'connection' && selection?.connectionId === item.id);
                          return (
                            <li key={item.id}>
                              <button
                                type="button"
                                className={styles.navigatorItemButton}
                                data-kind={item.kind}
                                data-active={isActive ? 'true' : 'false'}
                                onClick={() => handleNavigatorItemClick(item)}
                              >
                                <span className={styles.navigatorItemLabel}>{item.label}</span>
                                {item.subtitle ? (
                                  <span className={styles.navigatorItemSubtitle}>{item.subtitle}</span>
                                ) : null}
                              </button>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.navigatorTotals}>
                <span>
                  Nodes <strong>{navigatorSummary.totals.nodes}</strong>
                </span>
                <span>
                  Connections <strong>{navigatorSummary.totals.connections}</strong>
                </span>
                <span>
                  Groups <strong>{navigatorSummary.totals.groups}</strong>
                </span>
              </div>
            )}
          </section>
        ) : null}
      </main>

      <aside className={styles.settingsPanel}>
        <div className={styles.panelHeader}>
          <h1>Playground</h1>
          <p>
            Experiment with graph presets, colour rules, and reusable node templates. Settings update live, and you can
            always undo changes as you iterate.
          </p>
        </div>

        <label className={styles.controlLabel} htmlFor="graph-template-select">
          Start from preset
          <select
            id="graph-template-select"
            value={selectedTemplate}
            onChange={event => applyTemplate(event.target.value as keyof typeof graphPresets)}
          >
            {Object.keys(graphPresets).map(key => (
              <option key={key} value={key}>
                {key.toUpperCase()}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.settingsSection}>
          <nav className={styles.settingsTabs} role="tablist">
            {settingsTabs.map(tab => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeSettingsTab === tab.key}
                className={clsx(styles.tabButton, activeSettingsTab === tab.key && styles.tabButtonActive)}
                onClick={() => setActiveSettingsTab(tab.key as SettingsTabKey)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <div className={styles.tabPanel} role="tabpanel">{tabContent[activeSettingsTab]}</div>
        </div>

        <div className={styles.actions}>
          <button type="button" onClick={handleUndo} disabled={!historyAvailability.canUndo}>
            Undo
          </button>
          <button type="button" onClick={handleRedo} disabled={!historyAvailability.canRedo}>
            Redo
          </button>
          <button type="button" onClick={() => applyTemplate(selectedTemplate)}>Reset preset</button>
          <button type="button" onClick={deleteSelection} disabled={!selection?.nodeId && !selection?.connectionId}>
            Delete selection
          </button>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(stateJson).catch(() => {});
            }}
          >
            Copy JSON
          </button>
        </div>

        <div className={styles.stats}>
          <div>
            <span className={styles.statLabel}>Nodes</span>
            <span className={styles.statValue}>{state.nodes.length}</span>
          </div>
          <div>
            <span className={styles.statLabel}>Connections</span>
            <span className={styles.statValue}>{state.connections.length}</span>
          </div>
          <div>
            <span className={styles.statLabel}>Groups</span>
            <span className={styles.statValue}>{state.groups.length}</span>
          </div>
        </div>

        {viewport ? (
          <div className={styles.viewportBox}>
            <span className={styles.statLabel}>Viewport</span>
            <div className={styles.viewportValues}>
              <span>
                Zoom <strong>{viewport.zoom.toFixed(2)}×</strong>
              </span>
              <span>
                Offset <strong>{viewport.position.x.toFixed(0)}px</strong>,{' '}
                <strong>{viewport.position.y.toFixed(0)}px</strong>
              </span>
            </div>
          </div>
        ) : null}

        <p className={styles.tip}>
          Tip: drag empty canvas space to pan, scroll to zoom, and refine colour rules to control which ports can talk
          to each other. The navigator on the right jumps to nodes instantly, and the Templates tab lets you reuse and
          customise node shapes without mutating the original library.
        </p>
      </aside>
    </div>
  );
};

export default PlaygroundPage;
