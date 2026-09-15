import { describe, expect, it } from "vitest";
import { createTestDb } from "@senify/core/testing";

describe("createTestDb", () => {
  it("provides a working in-memory postgres", () => {
    const db = createTestDb();
    db.public.none("create table sites (id text primary key, name text not null)");
    db.public.none("insert into sites (id, name) values ('s_1', 'Demo')");
    const rows = db.public.many("select id, name from sites");
    expect(rows).toEqual([{ id: "s_1", name: "Demo" }]);
  });
});
