import * as Domain from '@alchemy.run/domain';
import { Thread } from './Thread/Thread.aggregate.ts';

export class Coil extends Domain.Model('Coil', { aggregates: [Thread] }) {}
