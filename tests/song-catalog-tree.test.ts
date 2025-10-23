import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCatalogRecords, buildCatalogTree, type CatalogTreeNode } from '../frontend/src/components/SongCatalogTable';

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

const flattenLabels = (nodes: CatalogTreeNode[]): string[] =>
  nodes.flatMap((node) => [node.label, ...flattenLabels(node.children)]);

test('buildCatalogTree nests records by grouping with stable ordering', () => {
  const clips = [
    {
      id: 201,
      title: 'Night Cut',
      videoId: 21,
      videoTitle: 'Midnight Dream',
      originalComposer: 'Composer Z',
      videoOriginalComposer: null,
      artistDisplayName: 'Artist Z',
      artistName: null
    },
    {
      id: 202,
      title: 'Studio Take',
      videoId: 22,
      videoTitle: 'Studio Track',
      originalComposer: null,
      videoOriginalComposer: null,
      artistDisplayName: null,
      artistName: 'Artist Y'
    }
  ];

  const videos = [
    {
      id: 21,
      title: 'Midnight Dream',
      originalComposer: 'Composer Z',
      artistDisplayName: 'Artist Z',
      artistName: null,
      contentType: 'OFFICIAL',
      category: 'cover'
    },
    {
      id: 22,
      title: 'Studio Track',
      originalComposer: null,
      artistDisplayName: null,
      artistName: 'Artist Y',
      contentType: 'OFFICIAL',
      category: 'original'
    }
  ];

  const songs = [
    {
      id: 31,
      title: 'Ballad',
      originalComposer: null,
      artistDisplayName: 'Artist Z',
      artistName: null,
      contentType: 'OFFICIAL',
      category: 'original'
    }
  ];

  const records = buildCatalogRecords(clips, videos, songs);
  const { nodes: artistTree, nonLeafIds } = buildCatalogTree(records, 'artist');
  assert.equal(artistTree.length, 2);
  assert(nonLeafIds.every((id) => typeof id === 'string'));

  const artistZ = artistTree.find((node) => node.label === 'Artist Z');
  assert(artistZ);
  assert.equal(artistZ?.count, 2);
  const composerLabels = artistZ?.children.map((child) => child.label).sort();
  assert.deepEqual(composerLabels, ['Composer Z', '표기되지 않은 원곡자']);
  const midnightSong = artistZ?.children
    .find((child) => child.label === 'Composer Z')
    ?.children.find((child) => child.label === 'Midnight Dream');
  assert(midnightSong);
  const midnightClip = midnightSong?.children.find((child) => child.label === 'Night Cut');
  assert(midnightClip);
  assert.equal(midnightClip?.record?.clipTitle, 'Night Cut');

  const { nodes: composerTree } = buildCatalogTree(records, 'composer');
  assert.equal(composerTree[0]?.type, 'composer');
  assert(flattenLabels(composerTree).includes('Artist Z'));

  const { nodes: titleTree } = buildCatalogTree(records, 'title');
  assert(titleTree.some((node) => node.label === 'Ballad'));
  const balladNode = titleTree.find((node) => node.label === 'Ballad');
  assert(balladNode);
  const balladChildren = flattenLabels(balladNode.children);
  assert(balladChildren.includes('Artist Z'));
  assert(balladChildren.includes('표기되지 않은 원곡자'));
});
