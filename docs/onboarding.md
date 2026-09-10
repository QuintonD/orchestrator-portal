# Set up your first flow

In the current source build, creating a workspace opens **Get started**. You can
return through **More destinations → Get started**, or use **Set up my flow** on
an empty Portal. Existing workspaces keep their connections, profiles, settings
and normal landing page.

## What is already ready

The gateway creates your encrypted local workspace and a local brief. That guide
summarizes records already in the portal and refreshes when they change while
the gateway runs. It does not call a model. **Read my local brief** opens the
actual saved report; **Start with this workspace** leads to personal plans in
Today without requiring an external account.

The setup page checks known executable locations for OpenClaw and gbrain. This
does not start those tools, read their credentials, or scan your documents.

## Work with an assistant

1. Choose an existing saved connection, or select OpenClaw, a local model or
   subscription API, Hermes, or T3 Code. Each form explains what to enter and
   where the source must be running. The gateway is your computer, including
   when you use the portal from a phone.
2. Add the source. The portal saves it and checks it immediately. If the check
   fails, the saved connection stays available after a reload. Correct the
   source and use **Check connection**; use Connections to manage its details.
3. Choose **Prepare one assistant**. Review the suggested role and confirm the
   source's permissions. For a compatible model API, the provider setting comes
   from the connection automatically. Setup leaves the optional first brief off.
4. **Open my first conversation** opens an editable starter question. Review and
   send it when ready. T3 Code instead leads to a handoff you take into T3 Code.

Creating a role does not establish that model generation works. Its first reply
is a source claim to inspect. Paused requests, uncertain profiles and mismatched
provider settings lead back to Team for review before another task.

## Bring your notes

Choose local documents, Obsidian, selected Notion pages, or an existing gbrain
installation. Indexing selected documents requires your consent. After the
check, **Search my knowledge** takes you to the indexed evidence. A partially
indexed source remains searchable with its coverage warning visible. An empty
index needs a different folder or page selection before it can provide results.

Knowledge guides are optional. They prepare local inventories without sending
your notes to a model. Connecting knowledge does not grant an assistant access
to it automatically.

## Continue later or on another device

Connections and profiles are saved in the gateway. Setup uses those records to
show the next step; it does not keep a separate completion flag that can become
stale. The page address preserves the selected flow and source on reload. On
another device, choose that source from **Saved connection**.

For Android, expand **Use this workspace on my phone** for the connection guide.
The gateway must stay running, with private HTTPS access configured. Use the
same workspace passphrase. See [Android setup](android.md) and
[desktop startup](desktop.md).

## Remaining setup outside the portal

Runtime installation, source sign-in, tool permissions and subscription policy
are still owned by each source. The portal guides you to the source's setup;
it does not install runtimes or read account credentials automatically. Private
phone access also remains an explicit deployment step. Desktop startup on login
and automatic application updates are not available yet.

The implementation deliberately starts with one connected source and one role.
Prepared teams, extra knowledge sources and recurring source schedules can be
added after the first useful result.
