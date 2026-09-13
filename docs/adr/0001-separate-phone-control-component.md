# Separate phone execution from the portal

The user requires Android phone control to work both inside Orchestrator and as
its own component. A separately installed native companion and independent broker
own device execution and enforce local consent; the portal integrates through an
authenticated protocol and projects evidence. Adding accessibility authority or
an execution bridge to the existing gateway WebView would couple a privileged
device surface to the portal's larger trust boundary and prevent independent use.
