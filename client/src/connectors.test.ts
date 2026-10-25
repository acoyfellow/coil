import { Command, given, message, model, story } from 'foldkit/story';
import { describe, expect, test } from 'vitest';
import { SubmitConnectorAction } from './command';
import { initialModel } from './main';
import { Message } from './message';
import { paletteItems } from './palette';
import { update } from './update';

const base = { name: null, now: 1_000, online: true, theme: 'system' as const, openNew: false };

describe('connectors in settings and the palette', () => {
  test('a settings link opens the dialog on the Connectors section with the problem', () => {
    const opened = initialModel({
      ...base,
      openSettings: 'connectors',
      connectorProblem: 'refused',
    });

    expect(opened.settings).toEqual({ query: '', section: 'connectors' });
    expect(opened.connectorProblem).toBe('refused');
  });

  test('the palette offers connect or disconnect for each connector', () => {
    const ready = {
      ...initialModel(base),
      connectors: true,
      connectorList: [
        { id: 'ax-mcp', description: 'portal', connected: true },
        { id: 'docs', description: 'docs', connected: false },
      ],
    };

    const labels = paletteItems(ready, 'connect').map((item) => item.label);

    expect(labels).toContain('Disconnect ax-mcp');
    expect(labels).toContain('Connect docs');
  });

  test('choosing a connector action closes the palette and posts the form', () => {
    story(
      update,
      given({ ...initialModel(base), palette: { query: '', index: 0 } }),
      message(Message.ChoseConnectorAction({ id: 'ax-mcp', action: 'start' })),
      model((current) => expect(current.palette).toBeNull()),
      Command.expectExact(SubmitConnectorAction({ id: 'ax-mcp', action: 'start' })),
      Command.resolve(SubmitConnectorAction, Message.CompletedEffect()),
    );
  });
});
