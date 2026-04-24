const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const USER_ID = 'kavyansh_27122004';
const EMAIL_ID = 'kk7071@srmist.edu.in';           
const COLLEGE_ROLL = 'RA2311026010345';     

// Regex: exactly X->Y where X and Y are single uppercase letters, X != Y
const VALID_EDGE = /^([A-Z])->([A-Z])$/;

function parseAndValidate(data) {
  const validEdges = [];
  const invalidEntries = [];
  const duplicateEdges = [];
  const seenEdges = new Set();

  for (let raw of data) {
    // Trim whitespace first, then validate
    const entry = String(raw).trim();

    // Check for self-loop first (A->A)
    const selfLoop = /^([A-Z])->([A-Z])$/.exec(entry);
    if (selfLoop && selfLoop[1] === selfLoop[2]) {
      invalidEntries.push(raw);
      continue;
    }

    if (!VALID_EDGE.test(entry)) {
      invalidEntries.push(raw);
      continue;
    }

    // Valid edge — check for duplicate
    if (seenEdges.has(entry)) {
      // Only push once per unique duplicate
      if (!duplicateEdges.includes(entry)) {
        duplicateEdges.push(entry);
      }
    } else {
      seenEdges.add(entry);
      validEdges.push(entry);
    }
  }

  return { validEdges, invalidEntries, duplicateEdges };
}

function buildTrees(validEdges) {
  // Map: child -> parent (first-encountered parent wins)
  const parentOf = {};
  // Map: parent -> [children]
  const childrenOf = {};
  const allNodes = new Set();

  for (const edge of validEdges) {
    const [, parent, child] = VALID_EDGE.exec(edge);
    allNodes.add(parent);
    allNodes.add(child);

    if (!childrenOf[parent]) childrenOf[parent] = [];

    // Multi-parent: first-encountered parent wins
    if (parentOf[child] === undefined) {
      parentOf[child] = parent;
      childrenOf[parent].push(child);
    }
    // silently discard subsequent parent edges for same child
  }

  // Find connected components using Union-Find
  const uf = {};
  function find(x) {
    if (!uf[x]) uf[x] = x;
    if (uf[x] !== x) uf[x] = find(uf[x]);
    return uf[x];
  }
  function union(a, b) {
    uf[find(a)] = find(b);
  }

  for (const edge of validEdges) {
    const [, parent, child] = VALID_EDGE.exec(edge);
    union(parent, child);
  }

  // Group nodes by component
  const components = {};
  for (const node of allNodes) {
    const root = find(node);
    if (!components[root]) components[root] = new Set();
    components[root].add(node);
  }

  const hierarchies = [];

  for (const compNodes of Object.values(components)) {
    const nodes = [...compNodes];

    // Detect cycle using DFS
    const hasCycle = detectCycle(nodes, childrenOf);

    // Find root: node that never appears as child (in the kept edges)
    const roots = nodes.filter(n => parentOf[n] === undefined);

    let rootNode;
    if (roots.length === 0) {
      // Pure cycle — use lexicographically smallest node
      rootNode = nodes.sort()[0];
    } else {
      // Sort roots lexicographically and pick smallest
      roots.sort();
      rootNode = roots[0];
    }

    if (hasCycle) {
      hierarchies.push({ root: rootNode, tree: {}, has_cycle: true });
    } else {
      const tree = buildTreeObj(rootNode, childrenOf);
      const depth = calcDepth(rootNode, childrenOf);
      hierarchies.push({ root: rootNode, tree, depth });
    }
  }

  // Sort hierarchies by root lexicographically for consistent output
  hierarchies.sort((a, b) => a.root.localeCompare(b.root));

  return hierarchies;
}

function detectCycle(nodes, childrenOf) {
  const nodeSet = new Set(nodes);
  const visited = {};
  const inStack = {};

  function dfs(node) {
    visited[node] = true;
    inStack[node] = true;
    for (const child of (childrenOf[node] || [])) {
      if (!nodeSet.has(child)) continue;
      if (!visited[child]) {
        if (dfs(child)) return true;
      } else if (inStack[child]) {
        return true;
      }
    }
    inStack[node] = false;
    return false;
  }

  for (const node of nodes) {
    if (!visited[node]) {
      if (dfs(node)) return true;
    }
  }
  return false;
}

function buildTreeObj(node, childrenOf) {
  const children = childrenOf[node] || [];
  const obj = {};
  for (const child of children) {
    obj[child] = buildTreeObj(child, childrenOf);
  }
  return { [node]: obj };
}

function calcDepth(node, childrenOf) {
  const children = childrenOf[node] || [];
  if (children.length === 0) return 1;
  return 1 + Math.max(...children.map(c => calcDepth(c, childrenOf)));
}

function buildSummary(hierarchies) {
  const nonCyclic = hierarchies.filter(h => !h.has_cycle);
  const cyclic = hierarchies.filter(h => h.has_cycle);

  let largestRoot = '';
  let maxDepth = -1;

  for (const h of nonCyclic) {
    if (
      h.depth > maxDepth ||
      (h.depth === maxDepth && h.root < largestRoot)
    ) {
      maxDepth = h.depth;
      largestRoot = h.root;
    }
  }

  return {
    total_trees: nonCyclic.length,
    total_cycles: cyclic.length,
    largest_tree_root: largestRoot,
  };
}

app.post('/bfhl', (req, res) => {
  try {
    const { data } = req.body;

    if (!Array.isArray(data)) {
      return res.status(400).json({ error: '"data" must be an array' });
    }

    const { validEdges, invalidEntries, duplicateEdges } = parseAndValidate(data);
    const hierarchies = buildTrees(validEdges);
    const summary = buildSummary(hierarchies);

    return res.json({
      user_id: USER_ID,
      email_id: EMAIL_ID,
      college_roll_number: COLLEGE_ROLL,
      hierarchies,
      invalid_entries: invalidEntries,
      duplicate_edges: duplicateEdges,
      summary,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/', (req, res) => res.json({ status: 'ok', route: 'POST /bfhl' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
