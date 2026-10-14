import { useStash } from "./stash";
import { useTodos } from "./todos";
import { ALL, useWorkspaces, type Workspace } from "./workspaces";

export function workspaceStats(id: string) {
  const items = useStash.getState().items.filter((i) => id === ALL || i.workspaceId === id);
  const todos = useTodos.getState().todos.filter((t) => id === ALL || t.workspaceId === id);
  return {
    docs: items.filter((i) => i.kind === "note").length,
    files: items.filter((i) => i.kind === "file").length,
    links: items.filter((i) => i.kind === "link").length,
    items: items.length,
    openTodos: todos.filter((t) => !t.done).length,
  };
}

/** Delete a workspace and either move its contents to Personal or delete them. */
export function deleteWorkspace(id: string, mode: "move" | "delete") {
  const snapshot = {
    ws: useWorkspaces.getState().workspaces,
    current: useWorkspaces.getState().current,
    stash: { items: useStash.getState().items, collections: useStash.getState().collections },
    todos: { todos: useTodos.getState().todos, lists: useTodos.getState().lists },
  };
  useStash.getState().dropWorkspace(id, mode);
  useTodos.getState().dropWorkspace(id, mode);
  useWorkspaces.getState().remove(id);
  return () => {
    useWorkspaces.setState({ workspaces: snapshot.ws, current: snapshot.current });
    useStash.setState(snapshot.stash);
    useTodos.setState(snapshot.todos);
  };
}

export type { Workspace };
