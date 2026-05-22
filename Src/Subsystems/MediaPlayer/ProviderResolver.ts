// -- ProviderResolver --
// Routes a /play query through the registered providers in priority order.
// URL-shaped queries route deterministically to the one provider that
// recognises them (`canHandle`). Otherwise providers are searched in order
// and the first confident hit wins.

import { type GuildMember } from 'discord.js';
import {
  type MediaProvider,
  type ResolvedSearchResult,
  type SearchConfidence
} from './Interfaces/MediaProvider.js';
import { type ProviderId } from './Interfaces/Track.js';
import Utility from '../Utilities/SysUtils.js';

export interface ResolveResult extends ResolvedSearchResult {
  providerId: ProviderId | null;
}

export class ProviderResolver {
  private providers: MediaProvider[] = [];

  /** Append a provider. Order = priority — first registered is tried first. */
  register( provider: MediaProvider ): void {
    this.providers.push( provider );
  }

  /** Insert a provider at the front of the priority list. Used when adding
   *  a provider after the resolver was already built (e.g. Jellyfin once
   *  authenticated). */
  registerFirst( provider: MediaProvider ): void {
    this.providers.unshift( provider );
  }

  /** Look up a registered provider by id. Returns undefined if not present. */
  get( id: ProviderId ): MediaProvider | undefined {
    return this.providers.find( p => p.id === id );
  }

  /** Provider iteration (read-only) for diagnostics / tests. */
  list(): readonly MediaProvider[] {
    return this.providers;
  }

  async resolve( query: string, requestedBy: GuildMember ): Promise<ResolveResult> {
    const enabled = this.providers.filter( p => p.isEnabled() ).map( p => p.id );
    Utility.log(
      'info',
      `[RESOLVER] Query "${ query }" — enabled providers: [${ enabled.join( ', ' ) || 'none' }]`
    );

    // URL routing first — deterministic, skips priority order.
    const urlOwner = this.providers.find( p => p.isEnabled() && p.canHandle( query ) );
    if ( urlOwner != null ) {
      Utility.log( 'info', `[RESOLVER] URL routing to ${ urlOwner.id }.` );
      const result = await this.runSearch( urlOwner, query, requestedBy );
      Utility.log(
        'info',
        `[RESOLVER] ${ urlOwner.id } returned ${ result.tracks.length } track(s) confidence=${ result.confidence }.`
      );
      return { ...result, providerId: result.confidence === 'none' ? null : urlOwner.id };
    }

    // Fall through priority order until a provider returns a confident match.
    let bestNone: ResolveResult | null = null;
    for ( const provider of this.providers ) {
      if ( !provider.isEnabled() ) continue;
      const result = await this.runSearch( provider, query, requestedBy );
      Utility.log(
        'info',
        `[RESOLVER] ${ provider.id } returned ${ result.tracks.length } track(s) confidence=${ result.confidence }.`
      );
      if ( result.confidence !== 'none' ) {
        Utility.log( 'info', `[RESOLVER] Winner: ${ provider.id }.` );
        return { ...result, providerId: provider.id };
      }
      bestNone ??= { ...result, providerId: null };
    }

    Utility.log( 'warn', `[RESOLVER] No provider matched "${ query }".` );
    return bestNone ?? { tracks: [], confidence: 'none', providerId: null };
  }

  private async runSearch (
    provider: MediaProvider,
    query: string,
    requestedBy: GuildMember
  ): Promise<{ tracks: ResolvedSearchResult['tracks']; confidence: SearchConfidence }> {
    try {
      return await provider.search( query, { requestedBy } );
    }
    catch ( err ) {
      Utility.log( 'warn', `[RESOLVER] ${ provider.id }.search threw: ${ String( err ) }` );
      return { tracks: [], confidence: 'none' };
    }
  }
}
