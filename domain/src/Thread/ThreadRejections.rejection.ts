import * as Domain from '@alchemy.run/domain';
import * as Schema from 'effect/Schema';

export class NotCreated extends Domain.Rejection('NotCreated') {}
export class AlreadyCreated extends Domain.Rejection('AlreadyCreated') {}
export class Busy extends Domain.Rejection('Busy') {}
export class Archived extends Domain.Rejection('Archived') {}
export class NotOwner extends Domain.Rejection('NotOwner', { owner: Schema.String }) {}
