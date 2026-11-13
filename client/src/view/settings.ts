import type { Html } from 'foldkit/html';
import type { ConnectorState } from '../../../shared/protocol';
import { Message } from '../message';
import type { Model, SettingsSection } from '../model';
import type { H } from './parts';

type Section = {
  readonly id: SettingsSection;
  readonly label: string;
  readonly hint: string;
  readonly words: string;
};

const CLOUDFLARE_OWNER_PREFIX = 'cf:';

const isCloudflareUser = (who: string) => who.startsWith(CLOUDFLARE_OWNER_PREFIX);

export const sectionsFor = (model: Model): readonly Section[] => [
  {
    id: 'account',
    label: 'Account',
    hint: isCloudflareUser(model.who)
      ? 'Cloudflare account, gateway, sign out'
      : 'Who is signed in',
    words: 'account sign out log out gateway who email',
  },
  {
    id: 'app',
    label: 'App',
    hint: 'Theme, notifications, install',
    words: 'theme dark light notifications notify install app',
  },
  ...(model.connectors
    ? [
        {
          id: 'connectors' as const,
          label: 'Connectors',
          hint: 'Tool servers the agent can use',
          words: 'connectors mcp tools wiki jira gitlab oauth',
        },
      ]
    : []),
];

export const visibleSections = (model: Model): readonly Section[] => {
  const query = model.settings?.query.trim().toLowerCase() ?? '';
  const all = sectionsFor(model);

  return query === ''
    ? all
    : all.filter((section) =>
        `${section.label} ${section.hint} ${section.words}`.toLowerCase().includes(query),
      );
};

const fact = (h: H, label: string, value: string, id?: string): Html =>
  h.div(
    [h.Class('settings-fact')],
    [h.span([], [label]), h.span(id === undefined ? [] : [h.Id(id)], [value])],
  );

const signedInLabel = (model: Model) => {
  if (!isCloudflareUser(model.who)) return model.who === '' ? '…' : model.who;
  if (model.account === null) return 'Signed in with Cloudflare';

  return model.account.name;
};

const accountPane = (h: H, model: Model): Html[] => [
  h.h3([], ['Account']),
  fact(h, 'Signed in as', signedInLabel(model)),
  ...(isCloudflareUser(model.who)
    ? [
        fact(h, 'AI Gateway', model.account?.gateway ?? 'default'),
        h.div(
          [h.Class('settings-actions')],
          [
            h.a(
              [h.Id('gateway-link'), h.Class('settings-button'), h.Href('/oauth/gateway')],
              ['Change gateway'],
            ),
            h.form(
              [h.Id('sign-out'), h.Method('post'), h.Action('/oauth/logout')],
              [h.button([h.Type('submit'), h.Class('settings-button danger')], ['Sign out'])],
            ),
          ],
        ),
        h.p(
          [h.Class('settings-note')],
          ['Signing out removes coil access to your account on every device.'],
        ),
      ]
    : [h.p([h.Class('settings-note')], ['Cloudflare Access signs you in on this instance.'])]),
];

const THEME_LABEL: Record<Model['theme'], string> = {
  system: 'Match the system',
  light: 'Light',
  dark: 'Dark',
};

const NOTIFY_LABEL: Record<Model['notify'], string> = {
  unsupported: 'Not supported in this browser',
  default: 'Off',
  granted: 'On',
  denied: 'Blocked in browser settings',
};

const appPane = (h: H, model: Model): Html[] => [
  h.h3([], ['App']),
  fact(h, 'Theme', THEME_LABEL[model.theme]),
  h.div(
    [h.Class('settings-actions')],
    [
      h.button(
        [
          h.Id('theme'),
          h.Class('settings-button'),
          h.Type('button'),
          h.OnClick(Message.ClickedTheme()),
        ],
        ['Switch theme'],
      ),
    ],
  ),
  fact(h, 'Notifications', NOTIFY_LABEL[model.notify]),
  fact(h, 'Browser target', model.name ?? 'none'),
  h.div(
    [h.Class('settings-actions')],
    [
      h.button(
        [
          h.Id('sync-browser-cookies'),
          h.Class('settings-button'),
          h.Type('button'),
          h.OnClick(Message.ClickedSyncCookies()),
        ],
        ['Sync browser cookies from this Mac'],
      ),
    ],
  ),
  h.p(
    [h.Class('settings-note')],
    ['Import your local browser session into the browser of the open thread.'],
  ),
  h.div(
    [h.Class('settings-actions')],
    [
      h.button(
        [
          h.Id('notify'),
          h.Class('settings-button'),
          h.Type('button'),
          h.Disabled(model.notify !== 'default'),
          h.Attribute('aria-keyshortcuts', 'Meta+Shift+N Control+Shift+N'),
          h.OnClick(Message.ClickedNotify()),
        ],
        ['Notify me when a thread finishes'],
      ),
      ...(model.installable
        ? [
            h.button(
              [
                h.Id('install'),
                h.Class('settings-button'),
                h.Type('button'),
                h.OnClick(Message.ClickedInstall()),
              ],
              ['Install coil as an app'],
            ),
          ]
        : []),
    ],
  ),
  h.p([h.Class('settings-note')], ['Shortcuts: ⌘K search, ⌘, settings, ⌘⇧N notifications.']),
];

const connectorRow = (h: H, connector: ConnectorState): Html =>
  h.keyed('div')(
    `connector-${connector.id}`,
    [h.Class('settings-connector'), h.DataAttribute('connector', connector.id)],
    [
      h.div(
        [h.Class('settings-connector-name')],
        [h.span([], [connector.id]), h.small([], [connector.description])],
      ),
      h.span(
        [h.Class(connector.connected ? 'settings-state on' : 'settings-state')],
        [connector.connected ? 'connected' : 'not connected'],
      ),
      h.form(
        [
          h.Method('post'),
          h.Action(`/connectors/${connector.id}/${connector.connected ? 'disconnect' : 'start'}`),
        ],
        [
          h.button(
            [
              h.Type('submit'),
              h.Class(connector.connected ? 'settings-button' : 'settings-button primary'),
            ],
            [connector.connected ? 'Disconnect' : 'Connect'],
          ),
        ],
      ),
    ],
  );

const connectorsPane = (h: H, model: Model): Html[] => [
  h.h3([], ['Connectors']),
  ...(model.connectorProblem === null
    ? []
    : [h.p([h.Class('settings-alert'), h.Role('alert')], [model.connectorProblem])]),
  h.p(
    [h.Class('settings-note')],
    [
      'Connect a tool server once with your own sign-in. The agent then uses it; it never sees your token.',
    ],
  ),
  ...(model.connectorList.length === 0
    ? [h.p([h.Class('settings-note')], ['Loading connectors…'])]
    : model.connectorList.map((connector) => connectorRow(h, connector))),
];

const pane = (h: H, model: Model, section: SettingsSection): Html[] => {
  switch (section) {
    case 'account':
      return accountPane(h, model);
    case 'app':
      return appPane(h, model);
    case 'connectors':
      return connectorsPane(h, model);
  }
};

export const settings = (h: H, model: Model): Html => {
  const state = model.settings;

  if (state === null) return null;

  const sections = visibleSections(model);
  const active = sections.find((section) => section.id === state.section) ?? sections[0];

  return h.div(
    [h.Class('dialog-backdrop'), h.OnClick(Message.ClosedSettings())],
    [
      h.div(
        [
          h.Class('dialog settings'),
          h.Id('settings'),
          h.Role('dialog'),
          h.AriaModal(true),
          h.AriaLabel('Settings'),
          h.OnClick(Message.CompletedEffect(), { propagation: 'Stop' }),
        ],
        [
          h.div(
            [h.Class('settings-head')],
            [
              h.input([
                h.Id('settings-search'),
                h.Type('search'),
                h.Placeholder('Search settings'),
                h.AriaLabel('Search settings'),
                h.Autocomplete('off'),
                h.Value(state.query),
                h.OnInput((query) => Message.UpdatedSettingsQuery({ query })),
              ]),
              h.button(
                [
                  h.Class('settings-close'),
                  h.Type('button'),
                  h.AriaLabel('Close settings'),
                  h.OnClick(Message.ClosedSettings()),
                ],
                ['Esc'],
              ),
            ],
          ),
          h.div(
            [h.Class('settings-body')],
            [
              h.nav(
                [h.Class('settings-nav'), h.AriaLabel('Settings sections')],
                sections.map((section) =>
                  h.button(
                    [
                      h.Class(section.id === active?.id ? 'on' : ''),
                      h.Type('button'),
                      h.DataAttribute('section', section.id),
                      h.AriaCurrent(section.id === active?.id ? 'page' : 'false'),
                      h.OnClick(Message.ChoseSettingsSection({ section: section.id })),
                    ],
                    [h.span([], [section.label]), h.small([], [section.hint])],
                  ),
                ),
              ),
              h.section(
                [h.Class('settings-pane'), h.DataAttribute('pane', active?.id ?? 'none')],
                active === undefined
                  ? [h.p([h.Class('settings-note')], ['Nothing matches.'])]
                  : pane(h, model, active.id),
              ),
            ],
          ),
        ],
      ),
    ],
  );
};
