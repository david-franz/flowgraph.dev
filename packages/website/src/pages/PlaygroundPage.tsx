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
  FlowgraphRenderer,
  FlowgraphRendererOptions,
  FlowgraphRendererSelection,
  FlowgraphRendererTheme,
  FlowgraphRendererViewport,
} from '@flowtomic/flowgraph-core-view';
import styles from '../styles/PlaygroundPage.module.css';
import appStyles from '../styles/App.module.css';

const cloneState = (value: FlowGraphState): FlowGraphState => JSON.parse(JSON.stringify(value));

type MiniMapPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const portTypes = [
  {
    id: 'control',
    label: 'Control flow',
    color: '#f97316',
    accepts: ['control', 'data', 'error', 'analytics'],
  },
  {
    id: 'data',
    label: 'Data stream',
    color: '#38bdf8',
    accepts: ['data', 'analytics', 'vector', 'llm'],
  },
  {
    id: 'vector',
    label: 'Vector embedding',
    color: '#22d3ee',
    accepts: ['vector', 'llm'],
  },
  {
    id: 'text',
    label: 'Prompt / text',
    color: '#fbbf24',
    accepts: ['text', 'llm'],
  },
  {
    id: 'llm',
    label: 'LLM output',
    color: '#a855f7',
    accepts: ['text', 'analytics', 'llm'],
  },
  {
    id: 'analytics',
    label: 'Analytics / metrics',
    color: '#4ade80',
    accepts: ['analytics', 'data'],
  },
  {
    id: 'error',
    label: 'Error handling',
    color: '#f87171',
    accepts: ['error', 'control'],
  },
] as const;

type PortTypeId = (typeof portTypes)[number]['id'];

const portPalette: Record<PortTypeId, string> = portTypes.reduce(
  (acc, type) => {
    acc[type.id] = type.color;
    return acc;
  },
  {} as Record<PortTypeId, string>,
);

const portTypeById = new Map(portTypes.map(type => [type.id, type]));
const portTypeByColor = new Map(portTypes.map(type => [type.color, type]));

const defaultCustomPortColor = '#94a3b8';

const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 160;
const DEFAULT_NODE_CORNER_RADIUS = 16;
const DEFAULT_PORT_SPACING = 28;
const DEFAULT_PORT_REGION_PADDING = 52;
const DEFAULT_CONNECTION_MIN_CONTROL_DISTANCE = 80;
const DEFAULT_GRID_SIZE = 32;
const DEFAULT_ZOOM_MIN = 0.3;
const DEFAULT_ZOOM_MAX = 2.5;
const DEFAULT_MINIMAP_WIDTH = 200;
const DEFAULT_MINIMAP_HEIGHT = 140;

const THEME_PRESETS: Record<string, FlowgraphRendererTheme> = {
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
  blueprint: {
    background: '#0b1226',
    nodeFill: '#142549',
    nodeStroke: '#1f3a6f',
    nodeLabel: '#bfdbfe',
    portFill: '#60a5fa',
    connection: '#38bdf8',
    connectionSelected: '#facc15',
    draft: '#1e3a8a',
    miniMapBackground: 'rgba(9, 18, 40, 0.85)',
  },
  metropolis: {
    background: '#111827',
    nodeFill: '#1f2937',
    nodeStroke: '#374151',
    nodeLabel: '#f8fafc',
    portFill: '#f97316',
    connection: '#f59e0b',
    connectionSelected: '#34d399',
    draft: '#64748b',
    miniMapBackground: 'rgba(17, 24, 39, 0.85)',
  },
};

interface PlaygroundPresetSettings {
  interactive?: boolean;
  allowZoom?: boolean;
  allowPan?: boolean;
  allowNodeDrag?: boolean;
  syncViewport?: boolean;
  showNavigator?: boolean;
  navigatorExpanded?: boolean;
  showMiniMap?: boolean;
  miniMapPosition?: MiniMapPosition;
  miniMapSize?: { width: number; height: number };
  showGrid?: boolean;
  snapToGrid?: boolean;
  gridSize?: number;
  zoomExtent?: [number, number];
  nodeWidth?: number;
  nodeHeight?: number;
  nodeCornerRadius?: number;
  portSpacing?: number;
  portRegionPadding?: number;
  connectionMinControlDistance?: number;
  theme?: FlowgraphRendererTheme;
  connectionArrow?: 'arrow' | 'circle' | 'none';
  connectionPolicy?: ConnectionPolicy;
  colorRules?: ColorRules;
  preventSelfConnections?: boolean;
  canvasWidth?: number | null;
  canvasHeight?: number | null;
  initialSelection?: FlowgraphRendererSelection | null;
}

interface PlaygroundPreset {
  id: string;
  label: string;
  description: string;
  state: FlowGraphState;
  settings: PlaygroundPresetSettings;
}

const portLegend = portTypes.map(type => ({ id: type.id, label: type.label, color: type.color }));

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

const connectionRulePresets = [
  {
    id: 'types',
    label: 'Type defaults',
    description: 'Reset to the compatibility map derived from IO types.',
    factory: createDefaultColorRules,
  },
  {
    id: 'strict',
    label: 'Identical only',
    description: 'Allow connections only when the types match exactly.',
    factory: createStrictColorRules,
  },
  {
    id: 'broadcast',
    label: 'Control broadcast',
    description: 'Control-flow outputs can target any type; others follow type defaults.',
    factory: createControlBroadcastRules,
  },
] as const;

const colorLabelByValue = Object.fromEntries(colorOptions.map(option => [option.color, option.label]));

const createDefaultColorRules = (): ColorRules => {
  const rules: ColorRules = {};
  for (const sourceType of portTypes) {
    const allowedColors = new Set(
      (sourceType.accepts.length ? sourceType.accepts : [sourceType.id])
        .map(id => portTypeById.get(id)?.color)
        .filter((color): color is string => Boolean(color)),
    );
    rules[sourceType.color] = {};
    for (const targetType of portTypes) {
      rules[sourceType.color][targetType.color] = allowedColors.has(targetType.color);
    }
  }
  return rules;
};

const createAllowAllColorRules = (): ColorRules => {
  const rules: ColorRules = {};
  for (const sourceType of portTypes) {
    rules[sourceType.color] = {};
    for (const targetType of portTypes) {
      rules[sourceType.color][targetType.color] = true;
    }
  }
  return rules;
};

const createStrictColorRules = (): ColorRules => {
  const rules: ColorRules = {};
  for (const sourceType of portTypes) {
    rules[sourceType.color] = {};
    for (const targetType of portTypes) {
      rules[sourceType.color][targetType.color] = sourceType.color === targetType.color;
    }
  }
  return rules;
};

const createControlBroadcastRules = (): ColorRules => {
  const rules = createDefaultColorRules();
  const controlColor = portPalette.control;
  for (const targetType of portTypes) {
    rules[controlColor][targetType.color] = true;
    if (targetType.id !== 'error') {
      rules[targetType.color][controlColor] = true;
    }
  }
  return rules;
};

const cloneColorRules = (rules: ColorRules): ColorRules => JSON.parse(JSON.stringify(rules));

const describeColor = (value: string | null | undefined): string => {
  if (!value) {
    return 'uncoloured';
  }
  return colorLabelByValue[value] ?? `Custom (${value})`;
};

interface TemplatePortDraft {
  id: string;
  label?: string;
  direction: 'input' | 'output';
  color?: string;
  typeId: PortTypeId | 'custom';
  maxConnections: number | null;
  acceptsColors: string[];
  allowAny: boolean;
}

const buildPortDrafts = (template: GraphNodeTemplate<Record<string, unknown>>): TemplatePortDraft[] =>
  template.ports.map(port => {
    const type = port.color ? portTypeByColor.get(port.color) : undefined;
    const derivedAccepts = type
      ? type.accepts
          .map(id => portTypeById.get(id)?.color)
          .filter((color): color is string => Boolean(color))
      : [];
    const accepts = port.acceptsColors ? [...port.acceptsColors] : derivedAccepts;
    return {
      id: port.id,
      label: port.label,
      direction: port.direction,
      color: port.color ?? defaultCustomPortColor,
      typeId: port.color ? portTypeByColor.get(port.color)?.id ?? 'custom' : 'custom',
      maxConnections: port.maxConnections ?? null,
      acceptsColors: accepts,
      allowAny: accepts.length === 0,
    };
  });

const templateCategoryOrder = ['Integrations', 'Processing', 'AI', 'Operations', 'Utilities', 'General'] as const;

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
  {
    id: 'analytics-sink',
    label: 'Analytics Sink',
    description: 'Buffer metrics and forward them to a warehouse.',
    category: 'Utilities',
    ports: [
      {
        id: 'events',
        direction: 'input',
        label: 'Events',
        color: portPalette.analytics,
        acceptsColors: [portPalette.analytics, portPalette.data],
        maxConnections: 4,
      },
      {
        id: 'alerts',
        direction: 'output',
        label: 'Alerts',
        color: portPalette.error,
      },
    ],
    form: {
      sections: [
        {
          id: 'destination',
          title: 'Destination',
          fields: [
            {
              id: 'warehouse',
              label: 'Warehouse',
              kind: 'select',
              options: [
                { value: 'bigquery', label: 'BigQuery' },
                { value: 'snowflake', label: 'Snowflake' },
                { value: 'databricks', label: 'Databricks' },
              ],
              defaultValue: 'bigquery',
            },
            {
              id: 'table',
              label: 'Table name',
              kind: 'text',
              placeholder: 'events.session_metrics',
              required: true,
            },
            {
              id: 'retention',
              label: 'Retention (days)',
              kind: 'number',
              defaultValue: 30,
            },
          ],
        },
      ],
    },
    defaults: {
      metadata: { icon: 'chart-bar' },
      data: {
        warehouse: 'bigquery',
        table: 'events.session_metrics',
        retention: 30,
      },
      size: { width: 260, height: 210 },
    },
  },
  {
    id: 'anomaly-detector',
    label: 'Anomaly Detector',
    description: 'Monitor streaming metrics and emit control signals when breaches occur.',
    category: 'Operations',
    ports: [
      {
        id: 'metrics',
        direction: 'input',
        label: 'Metrics',
        color: portPalette.analytics,
        acceptsColors: [portPalette.analytics, portPalette.data],
        maxConnections: 3,
      },
      {
        id: 'thresholds',
        direction: 'input',
        label: 'Threshold overrides',
        color: portPalette.control,
        acceptsColors: [portPalette.control],
        maxConnections: 1,
      },
      { id: 'alerts', direction: 'output', label: 'Alerts', color: portPalette.control },
      { id: 'annotations', direction: 'output', label: 'Annotations', color: portPalette.text },
    ],
    form: {
      sections: [
        {
          id: 'strategy',
          title: 'Detection strategy',
          fields: [
            {
              id: 'window',
              label: 'Window (minutes)',
              kind: 'number',
              defaultValue: 5,
              description: 'Sliding window size used for z-score evaluation.',
            },
            {
              id: 'sensitivity',
              label: 'Sensitivity',
              kind: 'select',
              options: [
                { value: 'conservative', label: 'Conservative' },
                { value: 'balanced', label: 'Balanced' },
                { value: 'aggressive', label: 'Aggressive' },
              ],
              defaultValue: 'balanced',
            },
            {
              id: 'autoTune',
              label: 'Auto tune thresholds',
              kind: 'checkbox',
              defaultValue: true,
            },
            {
              id: 'notifyChannels',
              label: 'Notify channels',
              kind: 'json',
              defaultValue: ['#ops-alerts'],
            },
          ],
        },
      ],
    },
    defaults: {
      metadata: { icon: 'activity' },
      data: {
        window: 5,
        sensitivity: 'balanced',
        autoTune: true,
        notifyChannels: ['#ops-alerts'],
      },
      size: { width: 280, height: 235 },
    },
  },
  {
    id: 'feature-flag',
    label: 'Feature Flag Splitter',
    description: 'Route traffic by feature flag state.',
    category: 'Utilities',
    ports: [
      {
        id: 'traffic',
        direction: 'input',
        label: 'Traffic',
        color: portPalette.control,
        acceptsColors: [portPalette.control],
        maxConnections: 2,
      },
      { id: 'enabled', direction: 'output', label: 'Enabled', color: portPalette.data },
      { id: 'disabled', direction: 'output', label: 'Disabled', color: portPalette.error },
    ],
    form: {
      sections: [
        {
          id: 'flag',
          title: 'Flag targeting',
          fields: [
            {
              id: 'flagKey',
              label: 'Flag key',
              kind: 'text',
              placeholder: 'checkout.new-flow',
              required: true,
            },
            {
              id: 'rollout',
              label: 'Rollout %',
              kind: 'number',
              defaultValue: 50,
            },
            {
              id: 'audience',
              label: 'Audience',
              kind: 'textarea',
              placeholder: 'geo == "US" && plan == "enterprise"',
            },
          ],
        },
      ],
    },
    defaults: {
      metadata: { icon: 'adjustments' },
      data: {
        flagKey: 'checkout.new-flow',
        rollout: 50,
        audience: '',
      },
      size: { width: 250, height: 210 },
    },
  },
  {
    id: 'batch-exporter',
    label: 'Batch Exporter',
    description: 'Schedule large exports to downstream systems.',
    category: 'Processing',
    ports: [
      {
        id: 'input',
        direction: 'input',
        label: 'Dataset',
        color: portPalette.analytics,
        acceptsColors: [portPalette.analytics, portPalette.data],
      },
      {
        id: 'schedule',
        direction: 'input',
        label: 'Schedule',
        color: portPalette.control,
        acceptsColors: [portPalette.control],
        maxConnections: 1,
      },
      {
        id: 'output',
        direction: 'output',
        label: 'Dispatch',
        color: portPalette.control,
      },
    ],
    form: {
      sections: [
        {
          id: 'export',
          title: 'Export configuration',
          fields: [
            {
              id: 'format',
              label: 'Format',
              kind: 'select',
              options: [
                { value: 'parquet', label: 'Parquet' },
                { value: 'csv', label: 'CSV' },
                { value: 'jsonl', label: 'JSONL' },
              ],
              defaultValue: 'parquet',
            },
            {
              id: 'compression',
              label: 'Compression',
              kind: 'select',
              options: [
                { value: 'snappy', label: 'Snappy' },
                { value: 'gzip', label: 'Gzip' },
                { value: 'none', label: 'None' },
              ],
              defaultValue: 'snappy',
            },
            {
              id: 'destination',
              label: 'Destination URI',
              kind: 'text',
              placeholder: 's3://exports/batch/',
              required: true,
            },
          ],
        },
      ],
    },
    defaults: {
      metadata: { icon: 'cloud-upload' },
      data: {
        format: 'parquet',
        compression: 'snappy',
        destination: 's3://exports/batch/',
      },
      size: { width: 280, height: 230 },
    },
  },
];

const playgroundPresets: PlaygroundPreset[] = [
  {
    id: 'workflow',
    label: 'Workflow automation',
    description: 'Branching lifecycle with customer notifications and error handling.',
    state: {
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
    settings: {
      interactive: true,
      allowZoom: true,
      allowPan: true,
      allowNodeDrag: true,
      syncViewport: true,
      showNavigator: true,
      navigatorExpanded: true,
      showMiniMap: true,
      miniMapPosition: 'top-right',
      miniMapSize: { width: DEFAULT_MINIMAP_WIDTH, height: DEFAULT_MINIMAP_HEIGHT },
      showGrid: false,
      snapToGrid: false,
      gridSize: DEFAULT_GRID_SIZE,
      zoomExtent: [DEFAULT_ZOOM_MIN, DEFAULT_ZOOM_MAX],
      nodeWidth: DEFAULT_NODE_WIDTH,
      nodeHeight: DEFAULT_NODE_HEIGHT,
      nodeCornerRadius: DEFAULT_NODE_CORNER_RADIUS,
      portSpacing: DEFAULT_PORT_SPACING,
      portRegionPadding: DEFAULT_PORT_REGION_PADDING,
      connectionMinControlDistance: DEFAULT_CONNECTION_MIN_CONTROL_DISTANCE,
      connectionArrow: 'arrow',
      theme: THEME_PRESETS.midnight,
      connectionPolicy: 'match',
      colorRules: createDefaultColorRules(),
      preventSelfConnections: true,
      initialSelection: { nodeId: 'start', connectionId: null },
    },
  },
  {
    id: 'uml',
    label: 'UML collaboration',
    description: 'Static service collaboration diagram with a fixed canvas.',
    state: {
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
    settings: {
      interactive: false,
      allowZoom: false,
      allowPan: false,
      allowNodeDrag: false,
      syncViewport: true,
      showNavigator: false,
      showMiniMap: false,
      showGrid: true,
      snapToGrid: false,
      gridSize: 48,
      zoomExtent: [0.8, 1.2],
      nodeWidth: 200,
      nodeHeight: 140,
      nodeCornerRadius: 6,
      portSpacing: 32,
      portRegionPadding: 48,
      connectionMinControlDistance: 96,
      connectionArrow: 'none',
      theme: THEME_PRESETS.blueprint,
      connectionPolicy: 'rules',
      colorRules: createStrictColorRules(),
      preventSelfConnections: true,
      canvasWidth: 960,
      canvasHeight: 540,
      initialSelection: { nodeId: 'login', connectionId: 'uml-1' },
    },
  },
  {
    id: 'rag',
    label: 'RAG pipeline',
    description: 'Retriever → ranker → generator pipeline with evaluation.',
    state: {
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
            { id: 'metrics', direction: 'output', label: 'metrics', color: portPalette.analytics },
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
    settings: {
      interactive: true,
      allowZoom: true,
      allowPan: true,
      allowNodeDrag: true,
      syncViewport: true,
      showNavigator: true,
      navigatorExpanded: true,
      showMiniMap: true,
      miniMapPosition: 'bottom-right',
      miniMapSize: { width: 220, height: 160 },
      showGrid: false,
      snapToGrid: false,
      gridSize: DEFAULT_GRID_SIZE,
      zoomExtent: [0.25, 1.8],
      nodeWidth: 240,
      nodeHeight: 180,
      nodeCornerRadius: 20,
      portSpacing: 32,
      portRegionPadding: 56,
      connectionMinControlDistance: 120,
      connectionArrow: 'arrow',
      theme: THEME_PRESETS.sunrise,
      connectionPolicy: 'match',
      colorRules: createDefaultColorRules(),
      preventSelfConnections: true,
      initialSelection: { nodeId: 'retriever', connectionId: null },
    },
  },
  {
    id: 'streaming',
    label: 'Streaming data mesh',
    description: 'Real-time event fan-out with anomaly detection and archival.',
    state: {
      nodes: [
        {
          id: 'gateway',
          label: 'Event Gateway',
          position: { x: 100, y: 120 },
          ports: [
            { id: 'sources', direction: 'input', label: 'sources', color: portPalette.control, acceptsColors: [portPalette.control] },
            { id: 'events', direction: 'output', label: 'events', color: portPalette.data },
            { id: 'telemetry', direction: 'output', label: 'metrics', color: portPalette.analytics },
          ],
        },
        {
          id: 'stream',
          label: 'Stream Processor',
          position: { x: 360, y: 160 },
          ports: [
            {
              id: 'input',
              direction: 'input',
              label: 'events',
              color: portPalette.data,
              acceptsColors: [portPalette.data, portPalette.control],
            },
            { id: 'vectors', direction: 'output', label: 'vectors', color: portPalette.vector },
            { id: 'aggregates', direction: 'output', label: 'aggregates', color: portPalette.analytics },
          ],
        },
        {
          id: 'detector',
          label: 'Anomaly Detector',
          position: { x: 620, y: 80 },
          ports: [
            {
              id: 'input',
              direction: 'input',
              label: 'vectors',
              maxConnections: 2,
              color: portPalette.vector,
              acceptsColors: [portPalette.vector],
            },
            { id: 'alerts', direction: 'output', label: 'alerts', color: portPalette.control },
          ],
        },
        {
          id: 'lake',
          label: 'Cold Storage',
          position: { x: 620, y: 220 },
          ports: [
            {
              id: 'input',
              direction: 'input',
              label: 'aggregates',
              color: portPalette.analytics,
              acceptsColors: [portPalette.analytics, portPalette.data],
            },
            { id: 'archive', direction: 'output', label: 'archive', color: portPalette.data },
          ],
        },
        {
          id: 'notifier',
          label: 'Ops Notifier',
          position: { x: 880, y: 60 },
          ports: [
            {
              id: 'input',
              direction: 'input',
              label: 'alerts',
              color: portPalette.control,
              acceptsColors: [portPalette.control],
            },
            { id: 'summary', direction: 'output', label: 'summary', color: portPalette.analytics },
          ],
        },
      ],
      connections: [
        { id: 'stream-1', source: { nodeId: 'gateway', portId: 'events' }, target: { nodeId: 'stream', portId: 'input' } },
        { id: 'stream-2', source: { nodeId: 'stream', portId: 'vectors' }, target: { nodeId: 'detector', portId: 'input' } },
        { id: 'stream-3', source: { nodeId: 'stream', portId: 'aggregates' }, target: { nodeId: 'lake', portId: 'input' } },
        { id: 'stream-4', source: { nodeId: 'detector', portId: 'alerts' }, target: { nodeId: 'notifier', portId: 'input' } },
        { id: 'stream-5', source: { nodeId: 'gateway', portId: 'telemetry' }, target: { nodeId: 'lake', portId: 'input' } },
      ],
      groups: [],
    },
    settings: {
      interactive: true,
      allowZoom: true,
      allowPan: true,
      allowNodeDrag: true,
      syncViewport: true,
      showNavigator: true,
      navigatorExpanded: true,
      showMiniMap: true,
      miniMapPosition: 'top-left',
      miniMapSize: { width: 240, height: 168 },
      showGrid: true,
      snapToGrid: true,
      gridSize: 56,
      zoomExtent: [0.35, 2.6],
      nodeWidth: 240,
      nodeHeight: 190,
      nodeCornerRadius: 18,
      portSpacing: 32,
      portRegionPadding: 54,
      connectionMinControlDistance: 140,
      connectionArrow: 'circle',
      theme: THEME_PRESETS.aurora,
      connectionPolicy: 'rules',
      colorRules: createControlBroadcastRules(),
      preventSelfConnections: false,
      initialSelection: { nodeId: 'stream', connectionId: null },
    },
  },
  {
    id: 'observability',
    label: 'Observability map',
    description: 'Analytics-heavy observability flow with dedicated sinks.',
    state: {
      nodes: [
        {
          id: 'metrics',
          label: 'Metrics Ingest',
          position: { x: 160, y: 140 },
          ports: [
            { id: 'input', direction: 'input', label: 'probes', color: portPalette.control, acceptsColors: [portPalette.control] },
            { id: 'timeseries', direction: 'output', label: 'time-series', color: portPalette.analytics },
            { id: 'raw', direction: 'output', label: 'raw data', color: portPalette.data },
          ],
        },
        {
          id: 'slo',
          label: 'SLO Evaluator',
          position: { x: 420, y: 80 },
          ports: [
            {
              id: 'metrics-in',
              direction: 'input',
              label: 'metrics',
              color: portPalette.analytics,
              acceptsColors: [portPalette.analytics],
            },
            { id: 'breaches', direction: 'output', label: 'breaches', color: portPalette.control },
            { id: 'scores', direction: 'output', label: 'scores', color: portPalette.analytics },
          ],
        },
        {
          id: 'dashboard',
          label: 'Dashboards',
          position: { x: 420, y: 220 },
          ports: [
            {
              id: 'feed',
              direction: 'input',
              label: 'analytics',
              color: portPalette.analytics,
              acceptsColors: [portPalette.analytics, portPalette.data],
            },
            { id: 'insights', direction: 'output', label: 'insights', color: portPalette.text },
          ],
        },
        {
          id: 'pager',
          label: 'On-call Pager',
          position: { x: 680, y: 60 },
          ports: [
            {
              id: 'alerts',
              direction: 'input',
              label: 'alerts',
              color: portPalette.control,
              acceptsColors: [portPalette.control],
            },
            { id: 'tickets', direction: 'output', label: 'tickets', color: portPalette.text },
          ],
        },
        {
          id: 'warehouse',
          label: 'Warehouse Sync',
          position: { x: 680, y: 220 },
          ports: [
            {
              id: 'input',
              direction: 'input',
              label: 'events',
              color: portPalette.data,
              acceptsColors: [portPalette.data, portPalette.analytics],
            },
            { id: 'exports', direction: 'output', label: 'exports', color: portPalette.data },
          ],
        },
      ],
      connections: [
        { id: 'obs-1', source: { nodeId: 'metrics', portId: 'timeseries' }, target: { nodeId: 'slo', portId: 'metrics-in' } },
        { id: 'obs-2', source: { nodeId: 'metrics', portId: 'raw' }, target: { nodeId: 'dashboard', portId: 'feed' } },
        { id: 'obs-3', source: { nodeId: 'slo', portId: 'breaches' }, target: { nodeId: 'pager', portId: 'alerts' } },
        { id: 'obs-4', source: { nodeId: 'slo', portId: 'scores' }, target: { nodeId: 'dashboard', portId: 'feed' } },
        { id: 'obs-5', source: { nodeId: 'dashboard', portId: 'insights' }, target: { nodeId: 'warehouse', portId: 'input' } },
      ],
      groups: [],
    },
    settings: {
      interactive: true,
      allowZoom: true,
      allowPan: true,
      allowNodeDrag: true,
      syncViewport: true,
      showNavigator: true,
      navigatorExpanded: false,
      showMiniMap: false,
      showGrid: true,
      snapToGrid: false,
      gridSize: 40,
      zoomExtent: [0.4, 2.1],
      nodeWidth: 230,
      nodeHeight: 180,
      nodeCornerRadius: 14,
      portSpacing: 30,
      portRegionPadding: 50,
      connectionMinControlDistance: 110,
      connectionArrow: 'arrow',
      theme: THEME_PRESETS.metropolis,
      connectionPolicy: 'rules',
      colorRules: (() => {
        const rules = createDefaultColorRules();
        const analyticsColor = portPalette.analytics;
        const textColor = portPalette.text;
        for (const type of portTypes) {
          rules[type.color][analyticsColor] = true;
        }
        rules[analyticsColor][textColor] = true;
        return rules;
      })(),
      preventSelfConnections: true,
      initialSelection: { nodeId: 'dashboard', connectionId: 'obs-2' },
    },
  },
];

type SettingsTabKey = 'behavior' | 'canvas' | 'connections' | 'layout' | 'theme' | 'templates';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const PlaygroundPage = (): JSX.Element => {
  const { graph, state } = useFlowgraph();
  const canvasRef = useRef<FlowCanvasHandle | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<PlaygroundPreset['id']>('workflow');
  const [selection, setSelection] = useState<FlowgraphRendererSelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewport, setViewport] = useState<FlowgraphRendererViewport | null>(null);
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);

  const themePresets = useMemo(() => THEME_PRESETS, []);

  const [activePreset, setActivePreset] = useState<string>('midnight');
  const [theme, setTheme] = useState<FlowgraphRendererTheme>(THEME_PRESETS.midnight);
  const [interactive, setInteractive] = useState(true);
  const [allowZoom, setAllowZoom] = useState(true);
  const [allowPan, setAllowPan] = useState(true);
  const [allowNodeDrag, setAllowNodeDrag] = useState(true);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [miniMapPosition, setMiniMapPosition] = useState<MiniMapPosition>('top-right');
  const [miniMapWidth, setMiniMapWidth] = useState(DEFAULT_MINIMAP_WIDTH);
  const [miniMapHeight, setMiniMapHeight] = useState(DEFAULT_MINIMAP_HEIGHT);
  const [connectionArrow, setConnectionArrow] = useState<'arrow' | 'circle' | 'none'>('arrow');
  const [preventSelfConnections, setPreventSelfConnections] = useState(true);
  const [connectionPolicy, setConnectionPolicy] = useState<ConnectionPolicy>('match');
  const [colorRules, setColorRules] = useState<ColorRules>(() => createDefaultColorRules());
  const [showNavigator, setShowNavigator] = useState(true);
  const [navigatorExpanded, setNavigatorExpanded] = useState(true);
  const [nodeWidth, setNodeWidth] = useState(DEFAULT_NODE_WIDTH);
  const [nodeHeight, setNodeHeight] = useState(DEFAULT_NODE_HEIGHT);
  const [nodeCornerRadius, setNodeCornerRadius] = useState(DEFAULT_NODE_CORNER_RADIUS);
  const [portSpacing, setPortSpacing] = useState(DEFAULT_PORT_SPACING);
  const [portRegionPadding, setPortRegionPadding] = useState(DEFAULT_PORT_REGION_PADDING);
  const [showGrid, setShowGrid] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [gridSize, setGridSize] = useState(DEFAULT_GRID_SIZE);
  const [canvasWidthInput, setCanvasWidthInput] = useState('');
  const [canvasHeightInput, setCanvasHeightInput] = useState('');
  const [syncViewport, setSyncViewport] = useState(true);
  const [connectionMinControlDistance, setConnectionMinControlDistance] = useState(
    DEFAULT_CONNECTION_MIN_CONTROL_DISTANCE,
  );
  const [zoomMin, setZoomMin] = useState(DEFAULT_ZOOM_MIN);
  const [zoomMax, setZoomMax] = useState(DEFAULT_ZOOM_MAX);
  const [rendererInstanceKey, setRendererInstanceKey] = useState(0);
  const [pendingInitialSelection, setPendingInitialSelection] = useState<FlowgraphRendererSelection | null | undefined>(
    undefined,
  );
  const [initialSelectionMode, setInitialSelectionMode] = useState<'none' | 'first-node' | 'first-connection' | 'snapshot'>(
    'none',
  );
  const [initialSelectionSnapshot, setInitialSelectionSnapshot] = useState<FlowgraphRendererSelection | null>(null);
  const normalizedZoomExtent = useMemo<[number, number]>(() => {
    const minZoomValue = Math.max(0.05, Math.min(zoomMin, zoomMax));
    const maxZoomValue = Math.max(minZoomValue + 0.05, Math.max(zoomMin, zoomMax));
    return [minZoomValue, maxZoomValue];
  }, [zoomMin, zoomMax]);
  const resolvedCanvasWidth = useMemo(() => {
    const trimmed = canvasWidthInput.trim();
    if (!trimmed) {
      return undefined;
    }
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return undefined;
    }
    return clamp(Math.round(numeric), 240, 3200);
  }, [canvasWidthInput]);
  const resolvedCanvasHeight = useMemo(() => {
    const trimmed = canvasHeightInput.trim();
    if (!trimmed) {
      return undefined;
    }
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return undefined;
    }
    return clamp(Math.round(numeric), 200, 2400);
  }, [canvasHeightInput]);
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTabKey>('behavior');
  const historyRef = useRef<FlowGraphState[]>([]);
  const historyIndexRef = useRef(-1);
  const isApplyingHistoryRef = useRef(false);
  const hasAutoFitRef = useRef(false);
  const [historyAvailability, setHistoryAvailability] = useState({ canUndo: false, canRedo: false });
  const templatesRegisteredRef = useRef(false);
  const pendingInitialSelectionRef = useRef<FlowgraphRendererSelection | null | undefined>(undefined);
  const [templateSearch, setTemplateSearch] = useState('');
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [nodeLabelOverride, setNodeLabelOverride] = useState('');
  const [nodeReadonly, setNodeReadonly] = useState(false);
  const [templateDataJson, setTemplateDataJson] = useState('{}');
  const [portDrafts, setPortDrafts] = useState<TemplatePortDraft[]>([]);
  const lastTemplateInitialisedRef = useRef<string | null>(null);

  const stateJson = useMemo(() => JSON.stringify(state, null, 2), [state]);
  const navigatorSummary = useMemo((): FlowGraphNavigatorSummary => buildNavigatorSummary(state), [state]);
  const templates = state.templates ?? [];
  const visibleTemplates = useMemo(() => {
    if (templates.length === 0) {
      return [] as GraphNodeTemplate[];
    }
    const query = templateSearch.trim().toLowerCase();
    if (!query) {
      return templates;
    }
    return templates.filter(template => {
      const categoryMatch = template.category?.toLowerCase().includes(query);
      const labelMatch = template.label?.toLowerCase().includes(query);
      const descriptionMatch = template.description?.toLowerCase().includes(query);
      const portMatch = template.ports.some(port => port.label?.toLowerCase().includes(query));
      return Boolean(categoryMatch || labelMatch || descriptionMatch || portMatch);
    });
  }, [templates, templateSearch]);

  const templateGroups = useMemo(() => {
    if (visibleTemplates.length === 0) {
      return [] as Array<{ category: string; templates: GraphNodeTemplate[] }>;
    }
    const grouped = new Map<string, GraphNodeTemplate[]>();
    for (const template of visibleTemplates) {
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
  }, [visibleTemplates]);

  const hasTemplates = templates.length > 0;
  const hasActiveSearch = templateSearch.trim().length > 0;

  useEffect(() => {
    const html = document.documentElement;
    const previousHtmlOverflow = html.style.overflow;
    const body = document.body;
    const previousBodyOverflow = body.style.overflow;
    const mainElement = document.querySelector<HTMLElement>(`.${appStyles.main}`);
    const headerElement = document.querySelector<HTMLElement>(`.${appStyles.header}`);
    const footerElement = document.querySelector<HTMLElement>(`.${appStyles.footer}`);
    const previousMainPadding = mainElement?.style.padding ?? '';
    const previousMainHeight = mainElement?.style.height ?? '';
    const previousMainOverflow = mainElement?.style.overflow ?? '';

    const applyLayoutSizing = () => {
      if (!mainElement) {
        return;
      }
      const headerHeight = headerElement?.offsetHeight ?? 0;
      const footerHeight = footerElement?.offsetHeight ?? 0;
      mainElement.style.padding = '0';
      mainElement.style.height = `${window.innerHeight - headerHeight - footerHeight}px`;
      mainElement.style.overflow = 'hidden';
    };

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    applyLayoutSizing();
    window.addEventListener('resize', applyLayoutSizing);

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      window.removeEventListener('resize', applyLayoutSizing);
      if (mainElement) {
        mainElement.style.padding = previousMainPadding;
        mainElement.style.height = previousMainHeight;
        mainElement.style.overflow = previousMainOverflow;
      }
    };
  }, []);

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

  const handleResetView = useCallback(() => {
    const [minZoom, maxZoom] = normalizedZoomExtent;
    const defaultZoom = clamp(1, minZoom, maxZoom);
    graph.setViewport({ x: 0, y: 0 }, defaultZoom);
  }, [graph, normalizedZoomExtent]);

  const handleZoomStep = useCallback(
    (direction: 'in' | 'out') => {
      const [minZoom, maxZoom] = normalizedZoomExtent;
      const renderer = canvasRef.current?.getRenderer();
      const currentViewport = renderer?.getViewport() ?? viewport ?? { position: { x: 0, y: 0 }, zoom: 1 };
      const factor = direction === 'in' ? 1.25 : 0.8;
      const nextZoom = clamp(currentViewport.zoom * factor, minZoom, maxZoom);
      graph.setViewport(currentViewport.position, nextZoom);
    },
    [canvasRef, graph, normalizedZoomExtent, viewport],
  );

  const handleFitToContent = useCallback(() => {
    const container = canvasContainerRef.current;
    if (!container) {
      return;
    }
    const nodes = graph.getState().nodes;
    if (nodes.length === 0) {
      handleResetView();
      return;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    nodes.forEach(node => {
      const width = node.size?.width ?? nodeWidth;
      const height = node.size?.height ?? nodeHeight;
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + width);
      maxY = Math.max(maxY, node.position.y + height);
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return;
    }

    const boundsWidth = Math.max(20, maxX - minX);
    const boundsHeight = Math.max(20, maxY - minY);
    const rect = container.getBoundingClientRect();
    const padding = 160;
    const innerWidth = Math.max(160, rect.width - padding);
    const innerHeight = Math.max(160, rect.height - padding);
    const [minZoom, maxZoom] = normalizedZoomExtent;
    const zoomX = innerWidth / boundsWidth;
    const zoomY = innerHeight / boundsHeight;
    let nextZoom = Math.min(zoomX, zoomY);
    if (!Number.isFinite(nextZoom) || nextZoom <= 0) {
      nextZoom = clamp(1, minZoom, maxZoom);
    }
    nextZoom = clamp(nextZoom, minZoom, maxZoom);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const halfWidth = rect.width / (2 * nextZoom);
    const halfHeight = rect.height / (2 * nextZoom);
    const position = {
      x: centerX - halfWidth,
      y: centerY - halfHeight,
    };

    graph.setViewport(position, nextZoom);
  }, [canvasContainerRef, graph, handleResetView, nodeHeight, nodeWidth, normalizedZoomExtent]);

  const handleRendererReady = useCallback(
    (_renderer: FlowgraphRenderer<Record<string, unknown>>) => {
      if (!hasAutoFitRef.current) {
        requestAnimationFrame(() => {
          handleFitToContent();
        });
        hasAutoFitRef.current = true;
      }
    },
    [handleFitToContent],
  );

  const applyThemePreset = useCallback(
    (presetKey: keyof typeof themePresets) => {
      setActivePreset(presetKey);
      setTheme({ ...themePresets[presetKey] });
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
    const [minZoom, maxZoom] = normalizedZoomExtent;
    const normalizedGridSize = Math.max(4, gridSize);
    const normalizedMiniMapWidth = Math.max(120, miniMapWidth);
    const normalizedMiniMapHeight = Math.max(80, miniMapHeight);
    const controlDistance = Math.max(24, connectionMinControlDistance);
    const shouldAttachValidator = preventSelfConnections || connectionPolicy !== 'any';

    const options: FlowgraphRendererOptions = {
      width: resolvedCanvasWidth,
      height: resolvedCanvasHeight,
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

    if (pendingInitialSelection !== undefined) {
      options.initialSelection = pendingInitialSelection ?? null;
    }

    return options;
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
    normalizedZoomExtent,
    theme,
    validateConnection,
    resolvedCanvasWidth,
    resolvedCanvasHeight,
    pendingInitialSelection,
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

  const applyPreset = useCallback(
    (presetId: PlaygroundPreset['id']) => {
      const preset = playgroundPresets.find(item => item.id === presetId) ?? playgroundPresets[0];
      if (!preset) {
        return;
      }

      const snapshot = cloneState(preset.state);
      graph.importState(snapshot);
      setSelectedPresetId(preset.id);

      const nextShowNavigator = preset.settings.showNavigator ?? true;
      const nextNavigatorExpanded = preset.settings.navigatorExpanded ?? nextShowNavigator;

      setInteractive(preset.settings.interactive ?? true);
      setAllowZoom(preset.settings.allowZoom ?? true);
      setAllowPan(preset.settings.allowPan ?? true);
      setAllowNodeDrag(preset.settings.allowNodeDrag ?? true);
      setSyncViewport(preset.settings.syncViewport ?? true);
      setShowNavigator(nextShowNavigator);
      setNavigatorExpanded(nextShowNavigator ? nextNavigatorExpanded : false);

      setShowMiniMap(preset.settings.showMiniMap ?? true);
      setMiniMapPosition(preset.settings.miniMapPosition ?? 'top-right');
      setMiniMapWidth(preset.settings.miniMapSize?.width ?? DEFAULT_MINIMAP_WIDTH);
      setMiniMapHeight(preset.settings.miniMapSize?.height ?? DEFAULT_MINIMAP_HEIGHT);

      setShowGrid(preset.settings.showGrid ?? false);
      setSnapToGrid(preset.settings.snapToGrid ?? false);
      setGridSize(preset.settings.gridSize ?? DEFAULT_GRID_SIZE);

      const nextZoomExtent = preset.settings.zoomExtent ?? [DEFAULT_ZOOM_MIN, DEFAULT_ZOOM_MAX];
      setZoomMin(nextZoomExtent[0]);
      setZoomMax(nextZoomExtent[1]);

      setNodeWidth(preset.settings.nodeWidth ?? DEFAULT_NODE_WIDTH);
      setNodeHeight(preset.settings.nodeHeight ?? DEFAULT_NODE_HEIGHT);
      setNodeCornerRadius(preset.settings.nodeCornerRadius ?? DEFAULT_NODE_CORNER_RADIUS);
      setPortSpacing(preset.settings.portSpacing ?? DEFAULT_PORT_SPACING);
      setPortRegionPadding(preset.settings.portRegionPadding ?? DEFAULT_PORT_REGION_PADDING);
      setConnectionMinControlDistance(
        preset.settings.connectionMinControlDistance ?? DEFAULT_CONNECTION_MIN_CONTROL_DISTANCE,
      );
      setConnectionArrow(preset.settings.connectionArrow ?? 'arrow');

      const nextCanvasWidth =
        preset.settings.canvasWidth === undefined || preset.settings.canvasWidth === null
          ? ''
          : String(preset.settings.canvasWidth);
      const nextCanvasHeight =
        preset.settings.canvasHeight === undefined || preset.settings.canvasHeight === null
          ? ''
          : String(preset.settings.canvasHeight);
      setCanvasWidthInput(nextCanvasWidth);
      setCanvasHeightInput(nextCanvasHeight);

      const nextPolicy = preset.settings.connectionPolicy ?? 'match';
      setConnectionPolicy(nextPolicy);
      const nextColorRules = preset.settings.colorRules
        ? cloneColorRules(preset.settings.colorRules)
        : createDefaultColorRules();
      setColorRules(nextColorRules);
      setPreventSelfConnections(preset.settings.preventSelfConnections ?? true);

      if (preset.settings.theme) {
        setTheme({ ...preset.settings.theme });
      } else {
        setTheme({ ...THEME_PRESETS.midnight });
      }
      setActivePreset('custom');

      const initialSelection =
        preset.settings.initialSelection !== undefined
          ? preset.settings.initialSelection
          : { nodeId: snapshot.nodes[0]?.id ?? null, connectionId: null };

      setSelection(initialSelection ?? null);
      setPendingInitialSelection(initialSelection ?? null);
      setInitialSelectionMode('none');
      setInitialSelectionSnapshot(null);

      setViewport(null);
      setError(null);
      hasAutoFitRef.current = false;
      setRendererInstanceKey(prev => prev + 1);

      requestAnimationFrame(() => {
        const targetNodeId = initialSelection?.nodeId ?? snapshot.nodes[0]?.id;
        if (targetNodeId) {
          canvasRef.current?.getRenderer()?.focusNode(targetNodeId);
        }
      });
    },
    [graph, canvasRef],
  );

  useEffect(() => {
    if (state.nodes.length === 0) {
      applyPreset('workflow');
    }
  }, [applyPreset, state.nodes.length]);

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

  useEffect(() => {
    pendingInitialSelectionRef.current = pendingInitialSelection;
  }, [pendingInitialSelection]);

  useEffect(() => {
    if (pendingInitialSelectionRef.current !== undefined) {
      setPendingInitialSelection(undefined);
    }
  }, [rendererInstanceKey]);

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

  const activePresetDefinition = useMemo(
    () => playgroundPresets.find(preset => preset.id === selectedPresetId) ?? playgroundPresets[0],
    [selectedPresetId],
  );

  const handleCanvasWidthBlur = useCallback(() => {
    const trimmed = canvasWidthInput.trim();
    if (!trimmed) {
      return;
    }
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setCanvasWidthInput('');
      return;
    }
    const normalized = clamp(Math.round(numeric), 240, 3200);
    setCanvasWidthInput(String(normalized));
  }, [canvasWidthInput]);

  const handleCanvasHeightBlur = useCallback(() => {
    const trimmed = canvasHeightInput.trim();
    if (!trimmed) {
      return;
    }
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setCanvasHeightInput('');
      return;
    }
    const normalized = clamp(Math.round(numeric), 200, 2400);
    setCanvasHeightInput(String(normalized));
  }, [canvasHeightInput]);

  const handleResetCanvasDimensions = useCallback(() => {
    setCanvasWidthInput('');
    setCanvasHeightInput('');
  }, []);

  const handleCaptureInitialSelection = useCallback(() => {
    if (!selection) {
      return;
    }
    setInitialSelectionSnapshot(selection);
    setInitialSelectionMode('snapshot');
  }, [selection]);

  const handleApplyInitialSelection = useCallback(() => {
    let nextSelection: FlowgraphRendererSelection | null;
    if (initialSelectionMode === 'first-node') {
      const firstNode = state.nodes[0];
      nextSelection = firstNode ? { nodeId: firstNode.id, connectionId: null } : null;
    } else if (initialSelectionMode === 'first-connection') {
      const firstConnection = state.connections[0];
      nextSelection = firstConnection ? { nodeId: null, connectionId: firstConnection.id } : null;
    } else if (initialSelectionMode === 'snapshot') {
      nextSelection = initialSelectionSnapshot ?? null;
    } else {
      nextSelection = null;
    }

    setPendingInitialSelection(nextSelection);
    hasAutoFitRef.current = false;
    setRendererInstanceKey(prev => prev + 1);
    setSelection(nextSelection ?? null);
  }, [initialSelectionMode, initialSelectionSnapshot, state.connections, state.nodes]);

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
      <div className={styles.controlGroup}>
        <span className={styles.groupLabel}>Initial selection</span>
        <label className={styles.controlLabel} htmlFor="initial-selection-mode">
          Mode
          <select
            id="initial-selection-mode"
            value={initialSelectionMode}
            onChange={event =>
              setInitialSelectionMode(event.target.value as 'none' | 'first-node' | 'first-connection' | 'snapshot')
            }
          >
            <option value="none">None (no pre-selection)</option>
            <option value="first-node">First node in graph</option>
            <option value="first-connection">First connection in graph</option>
            <option value="snapshot" disabled={!initialSelectionSnapshot}>
              Snapshot (captured selection)
            </option>
          </select>
        </label>
        <div className={styles.buttonRow}>
          <button
            type="button"
            onClick={handleCaptureInitialSelection}
            disabled={!selection}
          >
            Capture current selection
          </button>
          <button
            type="button"
            onClick={handleApplyInitialSelection}
            disabled={initialSelectionMode === 'snapshot' && !initialSelectionSnapshot}
          >
            Apply on next load
          </button>
        </div>
        <p className={styles.hint}>
          Recreates the renderer so the chosen selection is applied once during mount. Perfect for demos or static
          exports.
        </p>
        {initialSelectionMode === 'snapshot' ? (
          <p className={styles.hint}>
            {initialSelectionSnapshot
              ? `Snapshot saved for node ${initialSelectionSnapshot.nodeId ?? '—'} and connection ${
                  initialSelectionSnapshot.connectionId ?? '—'
                }.`
              : 'Capture a node or connection to enable the snapshot option.'}
          </p>
        ) : null}
      </div>
    </>
  );

  const canvasTabContent = (
    <>
      <div className={styles.controlGroup}>
        <span className={styles.groupLabel}>Dimensions</span>
        <div className={styles.inlineInputs}>
          <label>
            Width (px)
            <input
              type="number"
              min={240}
              max={3200}
              placeholder="Auto"
              value={canvasWidthInput}
              onChange={event => setCanvasWidthInput(event.target.value)}
              onBlur={handleCanvasWidthBlur}
            />
          </label>
          <label>
            Height (px)
            <input
              type="number"
              min={200}
              max={2400}
              placeholder="Auto"
              value={canvasHeightInput}
              onChange={event => setCanvasHeightInput(event.target.value)}
              onBlur={handleCanvasHeightBlur}
            />
          </label>
        </div>
        <button type="button" className={styles.clearButton} onClick={handleResetCanvasDimensions}>
          Reset to auto
        </button>
        <p className={styles.hint}>
          Leave either field blank to let the canvas flex with the layout. Values are clamped between 240–3200px for
          width and 200–2400px for height.
        </p>
      </div>
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
        <div className={styles.buttonRow}>
          {connectionRulePresets.map(preset => (
            <button
              key={preset.id}
              type="button"
              title={preset.description}
              onClick={() => {
                setConnectionPolicy('rules');
                setColorRules(preset.factory());
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className={styles.hint}>Preset buttons apply curated palettes for the matrix below.</p>
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
      prev.map(port => {
        if (port.id !== portId) {
          return port;
        }
        if (allowAny) {
          return { ...port, allowAny: true, acceptsColors: [] };
        }
        if (port.typeId !== 'custom') {
          const type = portTypeById.get(port.typeId);
          const derivedAccepts = type
            ? type.accepts
                .map(id => portTypeById.get(id)?.color)
                .filter((color): color is string => Boolean(color))
            : [];
          return {
            ...port,
            allowAny: derivedAccepts.length === 0,
            acceptsColors: derivedAccepts.length > 0 ? derivedAccepts : port.acceptsColors,
          };
        }
        return { ...port, allowAny: false };
      }),
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
        const acceptsColors = Array.from(next);
        return { ...port, acceptsColors, allowAny: acceptsColors.length === 0 };
      }),
    );
  }, []);

  const handleTemplateTypeChange = useCallback((portId: string, typeId: PortTypeId | 'custom') => {
    setPortDrafts(prev =>
      prev.map(port => {
        if (port.id !== portId) {
          return port;
        }
        const nextType = typeId !== 'custom' ? portTypeById.get(typeId) ?? null : null;
        const shouldResetAccepts = typeId !== port.typeId || port.allowAny || port.acceptsColors.length === 0;
        const derivedAccepts = nextType
          ? nextType.accepts
              .map(id => portTypeById.get(id)?.color)
              .filter((color): color is string => Boolean(color))
          : port.acceptsColors;
        const acceptsColors = nextType && shouldResetAccepts ? derivedAccepts : port.acceptsColors;
        const allowAny = acceptsColors.length === 0;
        const color = nextType ? nextType.color : port.color ?? defaultCustomPortColor;
        return {
          ...port,
          typeId,
          color,
          acceptsColors,
          allowAny,
        };
      }),
    );
  }, []);

  const handleTemplateCustomColorChange = useCallback((portId: string, color: string) => {
    const normalised = color && color.startsWith('#') ? color : `#${color.replace(/[^0-9a-f]/gi, '').slice(0, 6)}`;
    setPortDrafts(prev =>
      prev.map(port => (port.id === portId ? { ...port, color: normalised || defaultCustomPortColor } : port)),
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
        color: draft.color ?? basePort.color,
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
        <div className={styles.inlineInputs}>
          <label>
            Search templates
            <input
              type="text"
              id="template-search"
              value={templateSearch}
              placeholder="Search by label, category, or port"
              onChange={event => setTemplateSearch(event.target.value)}
            />
          </label>
          {hasActiveSearch ? (
            <button type="button" className={styles.clearButton} onClick={() => setTemplateSearch('')}>
              Clear
            </button>
          ) : null}
        </div>
        {templateGroups.length === 0 ? (
          <p className={styles.templatesEmpty}>
            {hasTemplates
              ? 'No templates match your search. Try a different keyword or reset the filter.'
              : 'Templates load automatically once the graph initialises.'}
          </p>
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
                  <span className={styles.portDraftType}>
                    {port.typeId === 'custom'
                      ? 'Custom'
                      : portTypeById.get(port.typeId)?.label ?? port.typeId}
                  </span>
                </div>
                <div className={styles.inlineInputs}>
                  <label>
                    Port type
                    <select
                      value={port.typeId}
                      onChange={event =>
                        handleTemplateTypeChange(port.id, event.target.value as PortTypeId | 'custom')
                      }
                    >
                      {portTypes.map(type => (
                        <option key={type.id} value={type.id}>
                          {type.label}
                        </option>
                      ))}
                      <option value="custom">Custom colour</option>
                    </select>
                  </label>
                  {port.typeId === 'custom' ? (
                    <label>
                      Colour
                      <input
                        type="color"
                        value={port.color ?? defaultCustomPortColor}
                        onChange={event => handleTemplateCustomColorChange(port.id, event.target.value)}
                      />
                    </label>
                  ) : null}
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
                  <>
                    <p className={styles.hint}>Tick the IO types this port should accept.</p>
                    <div className={styles.typeCheckboxGrid}>
                      {portTypes.map(type => (
                        <label key={type.id}>
                          <input
                            type="checkbox"
                            checked={port.acceptsColors.includes(type.color)}
                            onChange={() => handleTemplateColorToggle(port.id, type.color)}
                          />
                          <span className={styles.colorChip} style={{ background: type.color }} />
                          {type.label}
                        </label>
                      ))}
                    </div>
                  </>
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

  const handleDismissError = useCallback(() => setError(null), []);

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
    <div
      className={styles.playground}
      data-settings-collapsed={settingsCollapsed ? 'true' : 'false'}
      data-navigator-collapsed={navigatorExpanded ? 'false' : 'true'}
    >
      {settingsCollapsed ? (
        <button
          type="button"
          className={styles.settingsCollapsedHandle}
          onClick={() => setSettingsCollapsed(false)}
        >
          Settings
        </button>
      ) : (
        <aside className={styles.settingsPanel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelHeaderText}>
              <h1>Playground</h1>
              <p>
                Experiment with graph presets, colour rules, and reusable node templates. Settings update live, and you
                can always undo changes as you iterate.
              </p>
            </div>
            <button type="button" className={styles.collapseToggle} onClick={() => setSettingsCollapsed(true)}>
              Collapse
            </button>
          </div>

          <div className={styles.panelScroll}>
            <label className={styles.controlLabel} htmlFor="graph-template-select">
              Start from preset
              <select
                id="graph-template-select"
                value={selectedPresetId}
                onChange={event => applyPreset(event.target.value as PlaygroundPreset['id'])}
              >
                {playgroundPresets.map(preset => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            {activePresetDefinition ? (
              <p className={styles.hint}>{activePresetDefinition.description}</p>
            ) : null}

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
              <button type="button" onClick={() => applyPreset(selectedPresetId)}>Reset preset</button>
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
              Tip: drag empty canvas space to pan, scroll to zoom, and refine colour rules to control which ports can
              talk to each other. The navigator on the right jumps to nodes instantly, and the Templates tab lets you
              reuse and customise node shapes without mutating the original library.
            </p>
          </div>
        </aside>
      )}

      <main className={styles.stage} data-has-navigator={showNavigator ? 'true' : 'false'}>
        <div className={styles.canvasShell}>
          <div className={styles.canvasToolbar}>
            <div className={styles.canvasToolbarGroup}>
              <button type="button" onClick={() => handleZoomStep('out')} aria-label="Zoom out">
                −
              </button>
              <button type="button" onClick={() => handleZoomStep('in')} aria-label="Zoom in">
                +
              </button>
              <button type="button" onClick={handleResetView}>Reset view</button>
              <button type="button" onClick={handleFitToContent}>Fit contents</button>
            </div>
            <div className={styles.canvasToolbarStatus}>
              <span>
                Zoom <strong>{viewport ? viewport.zoom.toFixed(2) : '—'}×</strong>
              </span>
              <span>
                Offset{' '}
                <strong>{viewport ? viewport.position.x.toFixed(0) : '—'}px</strong>,{' '}
                <strong>{viewport ? viewport.position.y.toFixed(0) : '—'}px</strong>
              </span>
            </div>
          </div>
          <div ref={canvasContainerRef} className={styles.canvasWrapper}>
            <FlowCanvas
              key={rendererInstanceKey}
              ref={canvasRef}
              graph={graph}
              rendererOptions={rendererOptions}
              selection={selection ?? undefined}
              onRendererReady={handleRendererReady}
            />
          </div>
          {error ? (
            <div className={styles.canvasAlert} role="alert">
              <span>{error}</span>
              <button type="button" onClick={handleDismissError} aria-label="Dismiss error">
                ×
              </button>
            </div>
          ) : null}
        </div>
        {showNavigator ? (
          navigatorExpanded ? (
            <section className={styles.navigator} data-collapsed="false">
              <header>
                <span>Navigator</span>
                <div className={styles.navigatorControls}>
                  <span className={styles.navigatorTotalsLabel}>
                    {navigatorSummary.totals.nodes} nodes · {navigatorSummary.totals.connections} connections ·{' '}
                    {navigatorSummary.totals.groups} groups
                  </span>
                  <button type="button" onClick={() => setNavigatorExpanded(false)}>
                    Collapse
                  </button>
                </div>
              </header>
              <div className={styles.navigatorScroll}>
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
            </section>
          ) : (
            <button
              type="button"
              className={styles.navigatorCollapsedHandle}
              onClick={() => setNavigatorExpanded(true)}
            >
              Navigator
            </button>
          )
        ) : null}
      </main>
    </div>
  );
};

export default PlaygroundPage;
