import {
  ArrowClockwise,
  ArrowsIn,
  ArrowsOut,
  Crosshair,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react";
import { useTRPC } from "@renderer/trpc";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { logger } from "@utils/logger";
import { AnimatePresence, motion } from "framer-motion";
import Graph from "graphology";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sigma from "sigma";
import { drawDiscNodeLabel, EdgeArrowProgram } from "sigma/rendering";

const log = logger.scope("brain-graph");

// -- Types (aligned with agent memory system) --

type MemoryNodeType =
  | "fact"
  | "preference"
  | "decision"
  | "identity"
  | "event"
  | "observation"
  | "goal"
  | "todo";

type RelationEdgeType = "related_to" | "updates" | "contradicts";

interface MemoryNode {
  id: string;
  content: string;
  memoryType: string;
  importance: number;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string;
  accessCount: number;
  source: string | null;
  forgotten: boolean;
}

interface AssociationEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  weight: number;
  createdAt: string;
}

interface NodeDetail {
  node: MemoryNode;
  x: number;
  y: number;
}

// -- Constants --

const NODE_COLORS: Record<MemoryNodeType, string> = {
  identity: "#3b82f6",
  goal: "#f97316",
  decision: "#f59e0b",
  todo: "#a855f7",
  preference: "#06b6d4",
  fact: "#22c55e",
  event: "#ec4899",
  observation: "#8b5cf6",
};

const EDGE_COLORS: Record<RelationEdgeType, string> = {
  related_to: "#555555",
  updates: "#60a5fa",
  contradicts: "#f87171",
};

const FADED_NODE_COLOR = "#333333";
const BRAIN_NODE_ID = "__brain_hub__";
const BRAIN_LABEL = "Brain";
const BRAIN_EDGE_COLOR = "rgba(139,92,246,0.15)";
const INCREMENTAL_LAYOUT_MS = 800;
const INITIAL_LAYOUT_MS = 3000;

// -- Incremental diff helpers --

interface GraphDelta {
  addedNodes: MemoryNode[];
  removedNodeIds: string[];
  updatedNodes: MemoryNode[];
  addedEdges: AssociationEdge[];
  removedEdgeIds: string[];
  updatedEdges: AssociationEdge[];
  hasStructuralChanges: boolean;
}

function diffGraphData(
  oldNodes: MemoryNode[],
  oldEdges: AssociationEdge[],
  newNodes: MemoryNode[],
  newEdges: AssociationEdge[],
): GraphDelta {
  const oldNodeMap = new Map(oldNodes.map((n) => [n.id, n]));
  const newNodeMap = new Map(newNodes.map((n) => [n.id, n]));
  const oldEdgeMap = new Map(oldEdges.map((e) => [e.id, e]));
  const newEdgeMap = new Map(newEdges.map((e) => [e.id, e]));

  const addedNodes: MemoryNode[] = [];
  const updatedNodes: MemoryNode[] = [];
  for (const [id, node] of newNodeMap) {
    const old = oldNodeMap.get(id);
    if (!old) {
      addedNodes.push(node);
    } else if (old.updatedAt !== node.updatedAt) {
      updatedNodes.push(node);
    }
  }

  const removedNodeIds: string[] = [];
  for (const id of oldNodeMap.keys()) {
    if (!newNodeMap.has(id)) removedNodeIds.push(id);
  }

  const addedEdges: AssociationEdge[] = [];
  const updatedEdges: AssociationEdge[] = [];
  for (const [id, edge] of newEdgeMap) {
    const old = oldEdgeMap.get(id);
    if (!old) {
      addedEdges.push(edge);
    } else if (
      old.weight !== edge.weight ||
      old.relationType !== edge.relationType
    ) {
      updatedEdges.push(edge);
    }
  }

  const removedEdgeIds: string[] = [];
  for (const id of oldEdgeMap.keys()) {
    if (!newEdgeMap.has(id)) removedEdgeIds.push(id);
  }

  return {
    addedNodes,
    removedNodeIds,
    updatedNodes,
    addedEdges,
    removedEdgeIds,
    updatedEdges,
    hasStructuralChanges:
      addedNodes.length > 0 ||
      removedNodeIds.length > 0 ||
      addedEdges.length > 0 ||
      removedEdgeIds.length > 0,
  };
}

function findInitialPosition(
  graph: Graph,
  nodeId: string,
  newEdges: AssociationEdge[],
): { x: number; y: number } {
  const neighborIds: string[] = [];
  for (const edge of newEdges) {
    if (edge.sourceId === nodeId && graph.hasNode(edge.targetId)) {
      neighborIds.push(edge.targetId);
    }
    if (edge.targetId === nodeId && graph.hasNode(edge.sourceId)) {
      neighborIds.push(edge.sourceId);
    }
  }

  if (neighborIds.length > 0) {
    let sumX = 0;
    let sumY = 0;
    for (const id of neighborIds) {
      sumX += graph.getNodeAttribute(id, "x") as number;
      sumY += graph.getNodeAttribute(id, "y") as number;
    }
    return {
      x: sumX / neighborIds.length + (Math.random() - 0.5) * 10,
      y: sumY / neighborIds.length + (Math.random() - 0.5) * 10,
    };
  }

  if (graph.hasNode(BRAIN_NODE_ID)) {
    return {
      x:
        (graph.getNodeAttribute(BRAIN_NODE_ID, "x") as number) +
        (Math.random() - 0.5) * 40,
      y:
        (graph.getNodeAttribute(BRAIN_NODE_ID, "y") as number) +
        (Math.random() - 0.5) * 40,
    };
  }

  return { x: Math.random() * 100, y: Math.random() * 100 };
}

function rebuildBrainHubEdges(graph: Graph) {
  // Collect brain edges first to avoid iterator invalidation
  const brainEdges: string[] = [];
  graph.forEachEdge((edge) => {
    if (edge.startsWith("brain-")) brainEdges.push(edge);
  });
  for (const edge of brainEdges) graph.dropEdge(edge);

  // BFS to find connected components, link highest-importance per component
  const visited = new Set<string>();
  graph.forEachNode((nodeId) => {
    if (nodeId === BRAIN_NODE_ID || visited.has(nodeId)) return;

    const component: string[] = [];
    const queue = [nodeId];
    visited.add(nodeId);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      graph.forEachNeighbor(current, (neighbor) => {
        if (neighbor !== BRAIN_NODE_ID && !visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      });
    }

    let bestId = component[0];
    let bestImportance = -1;
    for (const id of component) {
      const nd = graph.getNodeAttribute(id, "nodeData") as MemoryNode | null;
      if (nd && nd.importance > bestImportance) {
        bestImportance = nd.importance;
        bestId = id;
      }
    }

    graph.addEdgeWithKey(`brain-${bestId}`, BRAIN_NODE_ID, bestId, {
      color: BRAIN_EDGE_COLOR,
      size: 0.5,
      type: "arrow",
      relationType: "brain_link",
    });
  });
}

function applyGraphDelta(graph: Graph, delta: GraphDelta) {
  // 1. Remove edges first (before removing nodes they connect)
  for (const edgeId of delta.removedEdgeIds) {
    if (graph.hasEdge(edgeId)) graph.dropEdge(edgeId);
  }

  // 2. Remove nodes (and their brain-hub edges)
  for (const nodeId of delta.removedNodeIds) {
    const brainKey = `brain-${nodeId}`;
    if (graph.hasEdge(brainKey)) graph.dropEdge(brainKey);
    if (graph.hasNode(nodeId)) graph.dropNode(nodeId);
  }

  // 3. Add new nodes at smart positions
  for (const node of delta.addedNodes) {
    const { x, y } = findInitialPosition(graph, node.id, delta.addedEdges);
    graph.addNode(node.id, {
      label: truncateLabel(node.content),
      size: 3 + node.importance * 8,
      color: NODE_COLORS[node.memoryType as MemoryNodeType] ?? "#666666",
      x,
      y,
      nodeData: node,
    });
  }

  // 4. Add new edges
  addEdgesToGraph(graph, delta.addedEdges);

  // 5. Update existing node attributes
  for (const node of delta.updatedNodes) {
    if (graph.hasNode(node.id)) {
      graph.mergeNodeAttributes(node.id, {
        label: truncateLabel(node.content),
        size: 3 + node.importance * 8,
        color: NODE_COLORS[node.memoryType as MemoryNodeType] ?? "#666666",
        nodeData: node,
      });
    }
  }

  // 6. Update existing edge attributes
  for (const edge of delta.updatedEdges) {
    if (graph.hasEdge(edge.id)) {
      graph.mergeEdgeAttributes(edge.id, {
        color: EDGE_COLORS[edge.relationType as RelationEdgeType] ?? "#444444",
        size: 1 + edge.weight * 2,
        relationType: edge.relationType,
      });
    }
  }

  // 7. Rebuild brain hub if structure changed
  if (delta.hasStructuralChanges) {
    rebuildBrainHubEdges(graph);
  }
}

// -- Component --

export function BrainGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const layoutRef = useRef<FA2Layout | null>(null);
  const prevGraphDataRef = useRef<{
    nodes: MemoryNode[];
    edges: AssociationEdge[];
  } | null>(null);
  const isInitializedRef = useRef(false);
  const layoutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const [edgeCount, setEdgeCount] = useState(0);
  const [selectedNode, setSelectedNode] = useState<NodeDetail | null>(null);
  const [brainSelected, setBrainSelected] = useState(false);
  const [_hoveredNode, setHoveredNode] = useState<string | null>(null);
  const hoveredNodeRef = useRef<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeNodeTypes, setActiveNodeTypes] = useState<Set<MemoryNodeType>>(
    () => new Set(),
  );
  const [activeEdgeTypes, setActiveEdgeTypes] = useState<Set<RelationEdgeType>>(
    () => new Set(),
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const visibleNodesRef = useRef<Set<string> | null>(null);
  const visibleEdgesRef = useRef<Set<string> | null>(null);

  const trpc = useTRPC();
  const {
    data: graphData,
    isLoading,
    refetch: refetchGraph,
  } = useQuery({
    ...trpc.memory.graph.queryOptions({ limit: 200 }),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    if (!searchQuery) {
      setDebouncedSearch("");
      return;
    }
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: ftsResults } = useQuery({
    ...trpc.memory.search.queryOptions({ query: debouncedSearch, limit: 50 }),
    enabled: debouncedSearch.length > 0,
  });

  const queryClient = useQueryClient();
  useSubscription(
    trpc.memory.onChanged.subscriptionOptions(undefined, {
      onData: () => {
        void queryClient.invalidateQueries(trpc.memory.graph.pathFilter());
        void queryClient.invalidateQueries(trpc.memory.search.pathFilter());
        void queryClient.invalidateQueries(trpc.memory.count.pathFilter());
        void queryClient.invalidateQueries(
          trpc.memory.associations.pathFilter(),
        );
      },
    }),
  );

  const ftsMatchIds = useMemo(() => {
    if (!ftsResults || ftsResults.length === 0) return null;
    return new Set(ftsResults.map((r) => r.memory.id));
  }, [ftsResults]);

  const brainSummary = useMemo(() => {
    if (!graphData) return null;
    const typeCounts = new Map<string, number>();
    let totalImportance = 0;
    for (const node of graphData.nodes) {
      typeCounts.set(
        node.memoryType,
        (typeCounts.get(node.memoryType) ?? 0) + 1,
      );
      totalImportance += node.importance;
    }
    return {
      totalNodes: graphData.nodes.length,
      totalEdges: graphData.edges.length,
      avgImportance:
        graphData.nodes.length > 0
          ? totalImportance / graphData.nodes.length
          : 0,
      typeCounts: Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [graphData]);

  const selectedNodeId = selectedNode?.node.id ?? null;

  const { data: associations } = useQuery({
    ...trpc.memory.associations.queryOptions({
      memoryId: selectedNodeId ?? "",
    }),
    enabled: !!selectedNodeId,
  });

  const cleanup = useCallback(() => {
    if (layoutTimeoutRef.current) {
      clearTimeout(layoutTimeoutRef.current);
      layoutTimeoutRef.current = null;
    }
    if (layoutRef.current) {
      layoutRef.current.kill();
      layoutRef.current = null;
    }
    if (sigmaRef.current) {
      sigmaRef.current.kill();
      sigmaRef.current = null;
    }
    graphRef.current = null;
    isInitializedRef.current = false;
  }, []);

  const toggleNodeType = useCallback((type: MemoryNodeType) => {
    setActiveNodeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const toggleEdgeType = useCallback((type: RelationEdgeType) => {
    setActiveEdgeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;

    const hasSearch = debouncedSearch.length > 0;
    const hasNodeFilter = activeNodeTypes.size > 0;
    const hasEdgeFilter = activeEdgeTypes.size > 0;

    if (!hasSearch && !hasNodeFilter && !hasEdgeFilter) {
      visibleNodesRef.current = null;
      visibleEdgesRef.current = null;
      sigmaRef.current?.refresh();
      return;
    }

    const filterSets: Set<string>[] = [];

    if (hasSearch && ftsMatchIds) {
      const searchVisible = new Set<string>();

      for (const id of ftsMatchIds) {
        if (graph.hasNode(id)) {
          searchVisible.add(id);
          graph.forEachNeighbor(id, (neighbor) => {
            searchVisible.add(neighbor);
          });
        }
      }

      filterSets.push(searchVisible);
    }

    if (hasNodeFilter) {
      const typeVisible = new Set<string>();
      graph.forEachNode((node, attrs) => {
        if (node === BRAIN_NODE_ID) return;
        const data = attrs.nodeData as MemoryNode;
        if (activeNodeTypes.has(data.memoryType as MemoryNodeType)) {
          typeVisible.add(node);
        }
      });
      filterSets.push(typeVisible);
    }

    if (hasEdgeFilter) {
      const edgeNodeVisible = new Set<string>();
      graph.forEachEdge((_edge, attrs, source, target) => {
        if (activeEdgeTypes.has(attrs.relationType as RelationEdgeType)) {
          edgeNodeVisible.add(source);
          edgeNodeVisible.add(target);
        }
      });
      filterSets.push(edgeNodeVisible);
    }

    let visibleNodes: Set<string>;
    if (filterSets.length === 0) {
      visibleNodesRef.current = null;
      visibleEdgesRef.current = null;
      sigmaRef.current?.refresh();
      return;
    } else if (filterSets.length === 1) {
      visibleNodes = filterSets[0];
    } else {
      const smallest = filterSets.reduce((a, b) => (a.size < b.size ? a : b));
      visibleNodes = new Set<string>();
      for (const node of smallest) {
        if (filterSets.every((s) => s.has(node))) {
          visibleNodes.add(node);
        }
      }
    }

    visibleNodes.add(BRAIN_NODE_ID);

    const visibleEdges = new Set<string>();
    graph.forEachEdge((edge, attrs, source, target) => {
      const isBrainEdge = source === BRAIN_NODE_ID || target === BRAIN_NODE_ID;
      const endpointsVisible =
        visibleNodes.has(source) && visibleNodes.has(target);
      const passesEdgeFilter =
        isBrainEdge ||
        !hasEdgeFilter ||
        activeEdgeTypes.has(attrs.relationType as RelationEdgeType);

      if (endpointsVisible && passesEdgeFilter) {
        visibleEdges.add(edge);
      }
    });

    visibleNodesRef.current = visibleNodes;
    visibleEdgesRef.current = visibleEdges;
    sigmaRef.current?.refresh();
  }, [debouncedSearch, ftsMatchIds, activeNodeTypes, activeEdgeTypes]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        document.activeElement?.tagName !== "INPUT"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (
        e.key === "Escape" &&
        document.activeElement === searchInputRef.current
      ) {
        setSearchQuery("");
        searchInputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!containerRef.current || !graphData) return;

    // ── Incremental update path ──────────────────────────────────────────
    if (
      isInitializedRef.current &&
      graphRef.current &&
      sigmaRef.current &&
      prevGraphDataRef.current
    ) {
      const delta = diffGraphData(
        prevGraphDataRef.current.nodes,
        prevGraphDataRef.current.edges,
        graphData.nodes,
        graphData.edges,
      );

      if (
        !delta.hasStructuralChanges &&
        delta.updatedNodes.length === 0 &&
        delta.updatedEdges.length === 0
      ) {
        return; // nothing changed
      }

      // Clear selected node if it was removed
      if (selectedNode && delta.removedNodeIds.includes(selectedNode.node.id)) {
        setSelectedNode(null);
      }

      const graph = graphRef.current;
      const layout = layoutRef.current;

      // Stop layout before mutations to avoid mid-mutation worker restarts
      if (layout?.isRunning()) layout.stop();
      if (layoutTimeoutRef.current) {
        clearTimeout(layoutTimeoutRef.current);
        layoutTimeoutRef.current = null;
      }

      applyGraphDelta(graph, delta);

      setNodeCount(graphData.nodes.length);
      const brainEdgeCount = graph.filterEdges((e) =>
        e.startsWith("brain-"),
      ).length;
      setEdgeCount(graph.size - brainEdgeCount);

      if (delta.hasStructuralChanges && layout) {
        // Delay start to let FA2's debounced worker respawn settle
        setTimeout(() => {
          if (!layout.isRunning()) layout.start();
          layoutTimeoutRef.current = setTimeout(() => {
            if (layout.isRunning()) layout.stop();
            layoutTimeoutRef.current = null;
          }, INCREMENTAL_LAYOUT_MS);
        }, 10);
      } else {
        // Attribute-only changes — just refresh rendering
        sigmaRef.current?.refresh();
      }

      prevGraphDataRef.current = {
        nodes: graphData.nodes,
        edges: graphData.edges,
      };

      log.info("Brain graph updated incrementally", {
        added: delta.addedNodes.length,
        removed: delta.removedNodeIds.length,
        updated: delta.updatedNodes.length,
        edgesAdded: delta.addedEdges.length,
        edgesRemoved: delta.removedEdgeIds.length,
      });

      return;
    }

    // ── Initial build path ───────────────────────────────────────────────
    cleanup();
    setSelectedNode(null);

    const graph = new Graph({ multi: false, type: "directed" });
    graphRef.current = graph;

    for (const node of graphData.nodes) {
      const size = 3 + node.importance * 8;
      graph.addNode(node.id, {
        label: truncateLabel(node.content),
        size,
        color: NODE_COLORS[node.memoryType as MemoryNodeType] ?? "#666666",
        x: Math.random() * 100,
        y: Math.random() * 100,
        nodeData: node,
      });
    }

    addEdgesToGraph(graph, graphData.edges);

    const realEdgeCount = graph.size;

    graph.addNode(BRAIN_NODE_ID, {
      label: BRAIN_LABEL,
      size: 16,
      color: "#1a1030",
      x: 50,
      y: 50,
      nodeData: null,
    });

    rebuildBrainHubEdges(graph);

    setNodeCount(graphData.nodes.length);
    setEdgeCount(realEdgeCount);

    const sigma = new Sigma(graph, containerRef.current, {
      allowInvalidContainer: true,
      renderLabels: true,
      labelRenderedSizeThreshold: 12,
      labelSize: 10,
      labelColor: { color: "#999999" },
      defaultEdgeType: "arrow",
      defaultEdgeColor: "#444444",
      edgeLabelSize: 10,
      edgeProgramClasses: {
        arrow: EdgeArrowProgram,
      },
      defaultDrawNodeLabel: (context, data, settings) => {
        if (!data.label) return;
        if (data.label === BRAIN_LABEL) {
          context.save();
          const r = data.size;
          const cx = data.x;
          const cy = data.y;

          const glow = context.createRadialGradient(
            cx,
            cy,
            r * 0.5,
            cx,
            cy,
            r * 2.6,
          );
          glow.addColorStop(0, "rgba(139,92,246,0.2)");
          glow.addColorStop(0.5, "rgba(139,92,246,0.06)");
          glow.addColorStop(1, "rgba(139,92,246,0)");
          context.fillStyle = glow;
          context.beginPath();
          context.arc(cx, cy, r * 2.6, 0, Math.PI * 2);
          context.fill();

          context.strokeStyle = "rgba(139,92,246,0.4)";
          context.lineWidth = 1.2;
          context.beginPath();
          context.arc(cx, cy, r * 1.15, 0, Math.PI * 2);
          context.stroke();

          const s = r * 0.55;
          const layers: [number, number][][] = [
            [
              [cx - s * 0.9, cy - s * 0.45],
              [cx - s * 0.9, cy + s * 0.45],
            ],
            [
              [cx, cy - s * 0.7],
              [cx, cy],
              [cx, cy + s * 0.7],
            ],
            [
              [cx + s * 0.9, cy - s * 0.45],
              [cx + s * 0.9, cy + s * 0.45],
            ],
          ];

          context.strokeStyle = "rgba(139,92,246,0.5)";
          context.lineWidth = 0.8;
          for (let l = 0; l < layers.length - 1; l++) {
            for (const from of layers[l]) {
              for (const to of layers[l + 1]) {
                context.beginPath();
                context.moveTo(from[0], from[1]);
                context.lineTo(to[0], to[1]);
                context.stroke();
              }
            }
          }

          context.fillStyle = "rgba(167,139,250,0.95)";
          for (const layer of layers) {
            for (const [nx, ny] of layer) {
              context.beginPath();
              context.arc(nx, ny, 1.8, 0, Math.PI * 2);
              context.fill();
            }
          }

          context.restore();
          return;
        }
        drawDiscNodeLabel(context, data, settings);
      },
      nodeReducer: (node, data) => {
        const res = { ...data };
        if (node === BRAIN_NODE_ID) {
          res.forceLabel = true;
          return res;
        }
        const visible = visibleNodesRef.current;
        if (visible && !visible.has(node)) {
          res.color = FADED_NODE_COLOR;
          res.label = "";
          return res;
        }
        const currentHovered = hoveredNodeRef.current;
        if (currentHovered && currentHovered !== node) {
          const g = graphRef.current;
          if (
            g &&
            !g.hasEdge(currentHovered, node) &&
            !g.hasEdge(node, currentHovered)
          ) {
            res.color = FADED_NODE_COLOR;
            res.label = "";
          }
        }
        return res;
      },
      edgeReducer: (edge, data) => {
        const res = { ...data };
        const visible = visibleEdgesRef.current;
        if (visible && !visible.has(edge)) {
          res.color = FADED_NODE_COLOR;
        }
        return res;
      },
    });

    sigmaRef.current = sigma;

    const layout = new FA2Layout(graph, {
      settings: {
        gravity: 1,
        scalingRatio: 10,
        barnesHutOptimize: true,
        barnesHutTheta: 0.5,
        strongGravityMode: false,
        slowDown: 5,
      },
    });
    layoutRef.current = layout;
    layout.start();

    layoutTimeoutRef.current = setTimeout(() => {
      if (layout.isRunning()) layout.stop();
      layoutTimeoutRef.current = null;
    }, INITIAL_LAYOUT_MS);

    prevGraphDataRef.current = {
      nodes: graphData.nodes,
      edges: graphData.edges,
    };
    isInitializedRef.current = true;

    log.info("Brain graph loaded", {
      nodes: graphData.nodes.length,
      edges: graphData.edges.length,
    });

    return () => {
      cleanup();
    };
  }, [graphData, cleanup, selectedNode]);

  useEffect(() => {
    const sigma = sigmaRef.current;
    if (!sigma) return;

    function handleClickNode({ node }: { node: string }) {
      if (node === BRAIN_NODE_ID) {
        setSelectedNode(null);
        setBrainSelected(true);
        return;
      }
      setBrainSelected(false);
      const graph = graphRef.current;
      const s = sigmaRef.current;
      if (!graph || !s) return;

      const attrs = graph.getNodeAttributes(node);
      const nodeData = attrs.nodeData as MemoryNode | undefined;
      if (!nodeData) return;

      const position = s.graphToViewport({ x: attrs.x, y: attrs.y });
      setSelectedNode({
        node: nodeData,
        x: position.x,
        y: position.y,
      });
    }

    function handleEnterNode({ node }: { node: string }) {
      if (node === BRAIN_NODE_ID) return;
      hoveredNodeRef.current = node;
      setHoveredNode(node);
      if (sigmaRef.current) {
        sigmaRef.current.getContainer().style.cursor = "pointer";
      }
    }

    function handleLeaveNode() {
      hoveredNodeRef.current = null;
      setHoveredNode(null);
      if (sigmaRef.current) {
        sigmaRef.current.getContainer().style.cursor = "default";
      }
    }

    function handleClickStage() {
      setSelectedNode(null);
      setBrainSelected(false);
    }

    sigma.on("clickNode", handleClickNode);
    sigma.on("enterNode", handleEnterNode);
    sigma.on("leaveNode", handleLeaveNode);
    sigma.on("clickStage", handleClickStage);

    return () => {
      sigma.off("clickNode", handleClickNode);
      sigma.off("enterNode", handleEnterNode);
      sigma.off("leaveNode", handleLeaveNode);
      sigma.off("clickStage", handleClickStage);
    };
  });

  const nodeTypeEntries = useMemo(
    () => Object.entries(NODE_COLORS) as [MemoryNodeType, string][],
    [],
  );
  const edgeTypeEntries = useMemo(
    () => Object.entries(EDGE_COLORS) as [RelationEdgeType, string][],
    [],
  );

  const selectedColor = selectedNode
    ? (NODE_COLORS[selectedNode.node.memoryType as MemoryNodeType] ?? "#666666")
    : "#666666";

  return (
    <div
      className="relative h-full w-full"
      style={{
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* Search + Stats */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 rounded-md bg-[--color-panel-solid] px-2 py-1.5">
          <MagnifyingGlass size={14} className="shrink-0 text-[--gray-a9]" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes..."
            className="w-40 bg-transparent text-[--gray-12] text-xs outline-none placeholder:text-[--gray-a6]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="shrink-0 text-[--gray-a9] transition-colors hover:text-[--gray-12]"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 rounded-md bg-[--color-panel-solid] px-3 py-1.5 text-[--gray-a9] text-xs">
          <span>{nodeCount} nodes</span>
          <span className="text-[--gray-a6]">|</span>
          <span>{edgeCount} edges</span>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 rounded-md bg-[--color-panel-solid] p-3">
        <div className="mb-2 font-medium text-[--gray-a9] text-xs">
          Memory Types
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {nodeTypeEntries.map(([type, color]) => (
            <button
              key={type}
              type="button"
              onClick={() => toggleNodeType(type)}
              className={`flex cursor-pointer items-center gap-1.5 rounded px-2 py-0.5 text-left transition-all hover:bg-[--gray-a3] ${activeNodeTypes.has(type) ? "bg-[--gray-a3]" : ""}`}
              style={{
                opacity:
                  activeNodeTypes.size > 0 && !activeNodeTypes.has(type)
                    ? 0.3
                    : 1,
              }}
            >
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-[--gray-a9] text-xs">{type}</span>
            </button>
          ))}
        </div>
        <div className="mt-2 border-[--gray-a4] border-t pt-2">
          <div className="mb-1 font-medium text-[--gray-a9] text-xs">
            Relation Types
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            {edgeTypeEntries.map(([type, color]) => (
              <button
                key={type}
                type="button"
                onClick={() => toggleEdgeType(type)}
                className={`flex cursor-pointer items-center gap-1.5 rounded px-2 py-0.5 text-left transition-all hover:bg-[--gray-a3] ${activeEdgeTypes.has(type) ? "bg-[--gray-a3]" : ""}`}
                style={{
                  opacity:
                    activeEdgeTypes.size > 0 && !activeEdgeTypes.has(type)
                      ? 0.3
                      : 1,
                }}
              >
                <span
                  className="inline-block h-0.5 w-3 shrink-0"
                  style={{
                    backgroundColor: color,
                    borderStyle: type === "contradicts" ? "dashed" : "solid",
                  }}
                />
                <span className="text-[--gray-a9] text-xs">
                  {type.replace(/_/g, " ")}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => sigmaRef.current?.getCamera().animatedReset()}
          className="flex h-7 w-7 items-center justify-center rounded-md bg-[--color-panel-solid] text-[--gray-a9] transition-colors hover:text-[--gray-12]"
          title="Reset zoom"
        >
          <Crosshair size={14} />
        </button>
        <button
          type="button"
          onClick={() => {
            const camera = sigmaRef.current?.getCamera();
            if (camera) camera.animatedZoom({ duration: 200 });
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md bg-[--color-panel-solid] text-[--gray-a9] transition-colors hover:text-[--gray-12]"
          title="Zoom in"
        >
          <ArrowsIn size={14} />
        </button>
        <button
          type="button"
          onClick={() => {
            const camera = sigmaRef.current?.getCamera();
            if (camera) camera.animatedUnzoom({ duration: 200 });
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md bg-[--color-panel-solid] text-[--gray-a9] transition-colors hover:text-[--gray-12]"
          title="Zoom out"
        >
          <ArrowsOut size={14} />
        </button>
        <button
          type="button"
          onClick={() => refetchGraph()}
          className="flex h-7 w-7 items-center justify-center rounded-md bg-[--color-panel-solid] text-[--gray-a9] transition-colors hover:text-[--gray-12]"
          title="Refresh data"
        >
          <ArrowClockwise size={14} />
        </button>
      </div>

      {/* Node detail panel */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            key={selectedNode.node.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="absolute right-3 bottom-3 z-20 w-80 rounded-lg border border-[--gray-a4] bg-[--color-panel-solid] shadow-xl"
          >
            <div className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <span
                  className="rounded px-1.5 py-0.5 font-medium text-xs"
                  style={{
                    backgroundColor: `${selectedColor}22`,
                    color: selectedColor,
                  }}
                >
                  {selectedNode.node.memoryType}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedNode(null)}
                  className="flex h-6 w-6 items-center justify-center rounded text-[--gray-a9] transition-colors hover:text-[--gray-12]"
                >
                  <X size={12} />
                </button>
              </div>
              <p className="mb-3 max-h-32 overflow-y-auto whitespace-pre-wrap text-[--gray-a11] text-sm leading-relaxed">
                {selectedNode.node.content}
              </p>
              <div className="flex flex-col gap-1 text-xs">
                {associations && (
                  <div className="flex items-center justify-between">
                    <span className="text-[--gray-a9]">Associations</span>
                    <span className="font-medium text-white">
                      {associations.length}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[--gray-a9]">Importance</span>
                  <span className="font-medium text-white">
                    {selectedNode.node.importance.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[--gray-a9]">Created</span>
                  <span className="font-medium text-white">
                    {new Date(selectedNode.node.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {brainSelected && brainSummary && (
          <motion.div
            key="brain-summary"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="absolute right-3 bottom-3 z-20 w-72 rounded-lg border border-[--gray-a4] bg-[--color-panel-solid] shadow-xl"
          >
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-medium text-[--gray-12] text-sm">
                  Memory Overview
                </span>
                <button
                  type="button"
                  onClick={() => setBrainSelected(false)}
                  className="flex h-6 w-6 items-center justify-center rounded text-[--gray-a9] transition-colors hover:text-[--gray-12]"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="mb-3 flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[--gray-a9]">Memories</span>
                  <span className="font-medium text-white">
                    {brainSummary.totalNodes}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[--gray-a9]">Associations</span>
                  <span className="font-medium text-white">
                    {brainSummary.totalEdges}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[--gray-a9]">Avg Importance</span>
                  <span className="font-medium text-white">
                    {brainSummary.avgImportance.toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                {brainSummary.typeCounts.map(
                  ([type, count]: [string, number]) => (
                    <div key={type} className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            NODE_COLORS[type as MemoryNodeType] ?? "#666666",
                        }}
                      />
                      <span className="flex-1 text-[--gray-a9] text-xs">
                        {type}
                      </span>
                      <span className="font-medium text-white text-xs">
                        {count}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sigma container */}
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ background: "transparent" }}
      />

      {/* Loading / empty states */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 text-[--gray-a9]">
            <div className="h-2 w-2 animate-pulse rounded-full bg-[--accent-9]" />
            Loading graph...
          </div>
        </div>
      )}
    </div>
  );
}

function truncateLabel(content: string): string {
  const firstLine = content.split("\n")[0].trim();
  if (firstLine.length <= 24) return firstLine;
  return `${firstLine.slice(0, 22)}...`;
}

function addEdgesToGraph(graph: Graph, edges: AssociationEdge[]) {
  for (const edge of edges) {
    if (
      graph.hasNode(edge.sourceId) &&
      graph.hasNode(edge.targetId) &&
      !graph.hasEdge(edge.id) &&
      !graph.hasDirectedEdge(edge.sourceId, edge.targetId)
    ) {
      graph.addEdgeWithKey(edge.id, edge.sourceId, edge.targetId, {
        color: EDGE_COLORS[edge.relationType as RelationEdgeType] ?? "#444444",
        size: 1 + edge.weight * 2,
        type: "arrow",
        relationType: edge.relationType,
      });
    }
  }
}
