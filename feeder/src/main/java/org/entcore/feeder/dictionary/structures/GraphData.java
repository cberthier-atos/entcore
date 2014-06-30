/*
 * Copyright. Tous droits réservés. WebServices pour l’Education.
 */

package org.entcore.feeder.dictionary.structures;

import org.entcore.feeder.utils.Neo4j;
import org.vertx.java.core.Handler;
import org.vertx.java.core.eventbus.Message;
import org.vertx.java.core.json.JsonArray;
import org.vertx.java.core.json.JsonObject;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;


public class GraphData {

	private static final ConcurrentMap<String, Structure> structures = new ConcurrentHashMap<>();
	private static final ConcurrentMap<String, Profile> profiles = new ConcurrentHashMap<>();

	static void loadData(final Neo4j neo4j, final Handler<Message<JsonObject>> handler) {
		String query =
				"MATCH (s:Structure) " +
				"OPTIONAL MATCH s<-[:DEPENDS]-(g:FunctionalGroup) " +
				"OPTIONAL MATCH s<-[:BELONGS]-(c:Class) " +
				"return s, collect(g.externalId) as groups, collect(c.externalId) as classes ";
		neo4j.execute(query, new JsonObject(), new Handler<Message<JsonObject>>() {
			@Override
			public void handle(Message<JsonObject> message) {
				String query =
						"MATCH (p:Profile) " +
						"OPTIONAL MATCH p<-[:COMPOSE]-(f:Function) " +
						"return p, collect(f.externalId) as functions ";
				neo4j.execute(query, new JsonObject(), new Handler<Message<JsonObject>>() {
					@Override
					public void handle(Message<JsonObject> message) {
						JsonArray res = message.body().getArray("result");
						if ("ok".equals(message.body().getString("status")) && res != null) {
							for (Object o : res) {
								if (!(o instanceof JsonObject)) continue;
								JsonObject r = (JsonObject) o;
								JsonObject p = r.getObject("p", new JsonObject()).getObject("data");
								profiles.putIfAbsent(p.getString("externalId"),
										new Profile(p, r.getArray("functions")));
							}
						}
						if (handler != null) {
							handler.handle(message);
						}
					}
				});
				JsonArray res = message.body().getArray("result");
				if ("ok".equals(message.body().getString("status")) && res != null) {
					for (Object o : res) {
						if (!(o instanceof JsonObject)) continue;
						JsonObject r = (JsonObject) o;
						JsonObject s = r.getObject("s", new JsonObject()).getObject("data");
						structures.putIfAbsent(s.getString("externalId"),
								new Structure(s, r.getArray("groups"), r.getArray("classes")));
					}
				}
			}
		});
	}

	public static boolean isReady() {
		return structures.isEmpty() && profiles.isEmpty();
	}

	public static void clear() {
		structures.clear();
		profiles.clear();
	}

	public static ConcurrentMap<String, Profile> getProfiles() {
		return profiles;
	}

	public static ConcurrentMap<String, Structure> getStructures() {
		return structures;
	}

}