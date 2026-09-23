"use client";

import { Component, Fragment, type ReactNode } from "react";

/**
 * A request that never reached the server — or whose answer never came back —
 * makes React throw where the form stands, and the nearest boundary above a
 * page is its route's `error.tsx`: a dropped connection on Like replaced the
 * whole entry page with an error screen (`OVE-493`, criterion 4), and on the
 * sign-in screen it took the typed address with it (`OVE-504`).
 *
 * This boundary answers it in place. It re-draws its control from scratch —
 * which puts back whatever its caller keeps above it, and not an optimistic
 * guess — and tells the control a request failed so it can say so. The forms
 * stay bare Server Action endpoints; this only changes what a hydrated page
 * does when the network does not.
 */
export class TransportBoundary extends Component<
  { render: (failures: number) => ReactNode },
  { failures: number; erred: boolean }
> {
  override state = { failures: 0, erred: false };

  static getDerivedStateFromError() {
    return { erred: true };
  }

  override componentDidUpdate() {
    if (this.state.erred) {
      this.setState((current) => ({
        failures: current.failures + 1,
        erred: false,
      }));
    }
  }

  override render() {
    // The key moves on the failing render itself, so the control is
    // re-mounted at once and never disappears for a frame.
    const failures = this.state.failures + (this.state.erred ? 1 : 0);
    return <Fragment key={failures}>{this.props.render(failures)}</Fragment>;
  }
}
