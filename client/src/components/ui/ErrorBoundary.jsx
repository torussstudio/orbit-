import { Component } from 'react';

const RELOAD_FLAG = 'orbit_chunk_reload_at';

// After a deploy, an open tab may ask for a page chunk that no longer exists.
function isChunkLoadError(error) {
  const message = String(error?.message || '');
  return (
    error?.name === 'ChunkLoadError' ||
    /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message)
  );
}

// Reload once to pick up the new build; never loop.
function reloadOnceForNewBuild() {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_FLAG) || 0);
    if (Date.now() - last < 10000) return false;
    window.sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/*
 * Catches render errors so one broken page doesn't blank the whole app.
 * Pass a changing `resetKey` (e.g. the route path) to clear the error on
 * navigation.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (isChunkLoadError(error) && reloadOnceForNewBuild()) return;
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    const chunkError = isChunkLoadError(this.state.error);

    return (
      <div className="page-body">
        <div role="alert" className="empty-state">
          <h3>{chunkError ? 'A new version of Orbit is available' : 'Something went wrong'}</h3>
          <p className="mb-4 text-[13px] text-[var(--text-2)]">
            {chunkError
              ? 'Reload the page to continue.'
              : 'This page ran into a problem. Reloading usually fixes it.'}
          </p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
