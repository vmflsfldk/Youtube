import test from "node:test";
import assert from "node:assert/strict";

import {
  __fetchVideoSectionsFromCommentsForTests as fetchVideoSectionsFromComments,
  __extractSectionsFromTextForTests as extractSectionsFromText
} from "../src/worker";
import type { Env } from "../src/worker";

test("fetchVideoSectionsFromComments paginates until it finds timestamped comment", async (t) => {
  const originalFetch = globalThis.fetch;
  const responses = [
    {
      items: [
        {
          snippet: { topLevelComment: { snippet: { textDisplay: "Great video!" } } }
        }
      ],
      nextPageToken: "NEXT_PAGE"
    },
    {
      items: [
        {
          snippet: {
            topLevelComment: {
              snippet: { textDisplay: "00:00 Intro\n05:30 Main Song\n10:00 Encore" }
            }
          }
        }
      ]
    }
  ];

  const calledUrls: URL[] = [];

  globalThis.fetch = (async (input: Request | URL | string): Promise<Response> => {
    const url = typeof input === "string" ? new URL(input) : input instanceof URL ? input : new URL(input.url);
    calledUrls.push(url);
    const payload = responses.shift() ?? { items: [] };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const env = {
    DB: { prepare: () => { throw new Error("not implemented"); } },
    YOUTUBE_API_KEY: "fake-key"
  } as unknown as Env;

  const sections = await fetchVideoSectionsFromComments(env, "video123", null);

  assert.equal(sections.length, 3);
  assert.equal(calledUrls.length, 2);
  assert.equal(calledUrls[0].searchParams.get("pageToken"), null);
  assert.equal(calledUrls[1].searchParams.get("pageToken"), "NEXT_PAGE");
  assert.equal(calledUrls[0].searchParams.get("maxResults"), "100");
  assert.equal(calledUrls[1].searchParams.get("maxResults"), "100");
});

test("extractSectionsFromText ignores comments without multiple timestamps", () => {
  const sections = extractSectionsFromText("Check out 01:23", null, "COMMENT");
  assert.equal(sections.length, 0);
});
