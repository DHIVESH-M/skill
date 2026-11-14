import { Component } from 'react'
/** Catches render errors (incl. WebGL/3D failures) so one broken widget never blanks the whole app. */
export default class ErrorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) { console.error('UI error:', error.message) }
  render() {
    if (!this.state.failed) return this.props.children
    if (this.props.fallback !== undefined) return this.props.fallback
    return <div role="alert" className="card m-4 !bg-pink/60 font-bold text-center space-y-3"><p>😬 Something went wrong while showing this page.</p>
      <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button></div>
  }
}
