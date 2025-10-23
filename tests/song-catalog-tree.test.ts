import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCatalogRecords, filterCatalogRecords } from '../frontend/src/components/SongCatalogTable';

test('buildCatalogRecords merges clips and songs while filtering unsupported media', () => {
  const clips = [
    {
      id: 101,
      title: 'Chorus Section',
      videoId: 1,
      videoTitle: 'Video Song',
      originalComposer: null,
      videoOriginalComposer: 'Composer A',
      artistDisplayName: null,
      artistName: null
    },
    {
      id: 102,
      title: 'Acoustic Cut',
      videoId: 2,
      videoTitle: null,
      originalComposer: null,
      videoOriginalComposer: null,
      artistDisplayName: 'Artist B',
      artistName: null
    }
  ];

  const videos = [
    {
      id: 1,
      title: 'Video Song',
      originalComposer: 'Composer A',
      artistDisplayName: 'Artist A',
      artistName: null,
      contentType: 'OFFICIAL',
      category: 'cover'
    },
    {
      id: 2,
      title: 'Clip Source Song',
      originalComposer: null,
      artistDisplayName: null,
      artistName: 'Artist B',
      contentType: 'CLIP_SOURCE',
      category: 'original'
    }
  ];

  const songs = [
    {
      id: 10,
      title: 'Ballad',
      originalComposer: null,
      artistDisplayName: 'Artist A',
      artistName: null,
      contentType: 'OFFICIAL',
      category: 'original'
    },
    {
      id: 11,
      title: 'Live Song',
      originalComposer: 'Composer Live',
      artistDisplayName: 'Live Artist',
      artistName: null,
      contentType: 'OFFICIAL',
      category: 'live'
    },
    {
      id: 12,
      title: 'Clip Source Single',
      originalComposer: 'Composer Clip',
      artistDisplayName: 'Clip Artist',
      artistName: null,
      contentType: 'CLIP_SOURCE',
      category: 'cover'
    }
  ];

  const records = buildCatalogRecords(clips, videos, songs);
  assert.equal(records.length, 3);
  assert(records.some((record) => record.id === 101));
  assert(records.some((record) => record.id === 102));
  assert(records.some((record) => record.id === -10));
  assert(!records.some((record) => record.id === -11));
  assert(!records.some((record) => record.id === -12));

  const clipSourceRecord = records.find((record) => record.id === 102);
  assert(clipSourceRecord);
  assert.equal(clipSourceRecord?.songTitle, 'Acoustic Cut');
  assert.equal(clipSourceRecord?.composer, '표기되지 않은 원곡자');

  const songRecord = records.find((record) => record.id === -10);
  assert(songRecord);
  assert.equal(songRecord?.songTitle, 'Ballad');
  assert.equal(songRecord?.clipTitle, 'Ballad');
  assert.equal(songRecord?.artist, 'Artist A');
});

test('filterCatalogRecords applies case-insensitive partial matches across fields', () => {
  const clips = [
    {
      id: 301,
      title: 'Midnight Clip',
      videoId: 41,
      videoTitle: 'Midnight Dream',
      originalComposer: 'Composer X',
      videoOriginalComposer: null,
      artistDisplayName: 'Artist X',
      artistName: null
    },
    {
      id: 302,
      title: 'Sunrise Version',
      videoId: 42,
      videoTitle: 'Sunrise Melody',
      originalComposer: 'Composer Y',
      videoOriginalComposer: null,
      artistDisplayName: 'Artist Y',
      artistName: null
    }
  ];

  const videos = [
    {
      id: 41,
      title: 'Midnight Dream',
      originalComposer: 'Composer X',
      artistDisplayName: 'Artist X',
      artistName: null,
      contentType: 'OFFICIAL',
      category: 'cover'
    },
    {
      id: 42,
      title: 'Sunrise Melody',
      originalComposer: 'Composer Y',
      artistDisplayName: 'Artist Y',
      artistName: null,
      contentType: 'OFFICIAL',
      category: 'original'
    }
  ];

  const songs = [
    {
      id: 51,
      title: 'Moonlight Sonata',
      originalComposer: 'Composer Classical',
      artistDisplayName: 'Artist X',
      artistName: null,
      contentType: 'OFFICIAL',
      category: 'original'
    }
  ];

  const records = buildCatalogRecords(clips, videos, songs);
  assert.equal(records.length, 3);

  const byArtist = filterCatalogRecords(records, { artist: 'artist x' });
  assert.equal(byArtist.length, 2);
  assert(byArtist.every((record) => record.artist === 'Artist X'));

  const byComposer = filterCatalogRecords(records, { composer: 'composer y' });
  assert.equal(byComposer.length, 1);
  assert.equal(byComposer[0]?.composer, 'Composer Y');

  const bySong = filterCatalogRecords(records, { song: 'moon' });
  assert.equal(bySong.length, 1);
  assert.equal(bySong[0]?.songTitle, 'Moonlight Sonata');

  const combined = filterCatalogRecords(records, { song: 'midnight', artist: 'artist x' });
  assert.equal(combined.length, 1);
  assert.equal(combined[0]?.songTitle, 'Midnight Dream');

  const noMatch = filterCatalogRecords(records, { artist: 'unknown' });
  assert.equal(noMatch.length, 0);
});
