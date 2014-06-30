package org.entcore.feeder.test.integration.java;

import org.entcore.feeder.utils.Neo4j;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.vertx.java.core.AsyncResult;
import org.vertx.java.core.AsyncResultHandler;
import org.vertx.java.core.Handler;
import org.vertx.java.core.VoidHandler;
import org.vertx.java.core.eventbus.EventBus;
import org.vertx.java.core.eventbus.Message;
import org.vertx.java.core.json.JsonArray;
import org.vertx.java.core.json.JsonObject;
import org.vertx.testtools.TestVerticle;

import java.io.File;
import java.io.IOException;

import static org.vertx.testtools.VertxAssert.assertEquals;
import static org.vertx.testtools.VertxAssert.fail;
import static org.vertx.testtools.VertxAssert.testComplete;

public class FeederTest extends TestVerticle {

	public static final String NEO4J_PERSISTOR = "neo4j.persistor";
	private String neo4jDeploymentId;
	private TemporaryFolder neo4jTmpFolder;
	private TemporaryFolder importTmpFolder;
	private EventBus eb;
	private Neo4j neo4j;

	@Override
	public void start() {
		neo4jTmpFolder = new TemporaryFolder();
		importTmpFolder = new TemporaryFolder();
		try {
			neo4jTmpFolder.create();
			importTmpFolder.create();
		} catch (IOException e) {
			e.printStackTrace();
			return;
		}
		vertx.fileSystem().copySync(FeederTest.class.getClassLoader().getResource("aaf-test").getPath(),
				importTmpFolder.getRoot().getAbsolutePath(), true);
		JsonObject neo4jConfig = new JsonObject()
			.putString("address", NEO4J_PERSISTOR)
			.putString("datastore-path", neo4jTmpFolder.getRoot().getAbsolutePath())
			.putObject("neo4j", new JsonObject()
					.putString("node_keys_indexable", "externalId")
					.putString("node_auto_indexing", "true"));
		container.deployModule("fr.wseduc~mod-neo4j-persistor~1.3-SNAPSHOT", neo4jConfig, 1,
				new AsyncResultHandler<String>() {
			@Override
			public void handle(AsyncResult<String> event) {
				JsonObject config = new JsonObject()
						.putString("neo4j-address", NEO4J_PERSISTOR)
						.putString("feeder", "AAF")
						.putString("import-files", importTmpFolder.getRoot().getAbsolutePath())
						.putNumber("delete-user-delay", 1000l)
						.putNumber("pre-delete-user-delay", 1000l)
						.putNumber("delete-task-delay", 3 * 60 * 1000l)
						.putNumber("pre-delete-task-delay", 2 * 60 * 1000l);
				container.deployModule(System.getProperty("vertx.modulename"), config, 1,
						new AsyncResultHandler<String>() {
							public void handle(AsyncResult<String> ar) {
								if (ar.succeeded()) {
									eb = vertx.eventBus();
									neo4j = new Neo4j(eb, NEO4J_PERSISTOR);
									neo4jDeploymentId = ar.result();
									neo4j.execute("CREATE (n:DeleteGroup {externalId :'DeleteGroup'})", null,
											new Handler<Message<JsonObject>>() {
										@Override
										public void handle(Message<JsonObject> event) {
											FeederTest.super.start();
										}
									});
								} else {
									ar.cause().printStackTrace();
								}
							}
						});
			}
		});
	}

	@Override
	public void stop() {
		if (importTmpFolder != null) {
			importTmpFolder.delete();
		}
		if (neo4jDeploymentId != null) {
			container.undeployModule(neo4jDeploymentId, new Handler<AsyncResult<Void>>() {
				@Override
				public void handle(AsyncResult<Void> event) {
					vertx.setTimer(1000, new Handler<Long>() {
						@Override
						public void handle(Long event) {
							if (neo4jTmpFolder != null) {
								neo4jTmpFolder.delete();
							}
							FeederTest.super.stop();
						}
					});
				}
			});
		} else {
			if (neo4jTmpFolder != null) {
				neo4jTmpFolder.delete();
			}
			super.stop();
		}
	}

	@Test
	public void testAAF() {
		importAAF(new VoidHandler() {
			@Override
			protected void handle() {
				transition(new VoidHandler() {
					@Override
					protected void handle() {
						deleteUsersInImport();
						importUpdate(new VoidHandler() {
							@Override
							protected void handle() {
								testComplete();
							}
						});
					}
				});
			}
		});
	}

	private void deleteUsersInImport() {
		vertx.fileSystem().deleteSync(importTmpFolder.getRoot().getAbsolutePath() + File.separator +
				"FULL_ENTTSSERVICES_Complet_20130117_Eleve_0000.xml");
		vertx.fileSystem().deleteSync(importTmpFolder.getRoot().getAbsolutePath() + File.separator +
				"FULL_ENTTSSERVICES_Complet_20130117_PersEducNat_0000.xml");
	}

	private void transition(final VoidHandler handler) {
		eb.registerHandler("user.repository", new Handler<Message<JsonObject>>() {
			@Override
			public void handle(Message<JsonObject> message) {
				String action = message.body().getString("action", "");
				switch (action) {
					case "delete-groups" :
						JsonArray groups = message.body().getArray("old-groups", new JsonArray());
						assertEquals(177 * 4 + 177, groups.size());
						String countQuery =
								"MATCH (s:Structure) " +
								"OPTIONAL MATCH s<-[:BELONGS]-(c:Class) " +
								"OPTIONAL MATCH s<-[:DEPENDS]-(f:FunctionalGroup) " +
								"OPTIONAL MATCH s<-[:DEPENDS*2]-(p:ProfileGroup) " +
								"RETURN count(distinct s) as nbStructures, count(distinct c) as nbClasses, " +
								"count(distinct p) as nbClassProfileGroups, count(distinct f) as nbFunctionalGroups";
						neo4j.execute(countQuery, new JsonObject(), new Handler<Message<JsonObject>>() {
							@Override
							public void handle(Message<JsonObject> event) {
								assertEquals("ok", event.body().getString("status"));
								JsonObject r = event.body().getArray("result").get(0);
								assertEquals(10, (int) r.getInteger("nbStructures", 0));
								assertEquals(0, (int) r.getInteger("nbClasses", 0));
								assertEquals(0, (int) r.getInteger("nbFunctionalGroups", 0));
								assertEquals(0, (int) r.getInteger("nbClassProfileGroups", 0));
								handler.handle(null);
							}
						});
						eb.unregisterHandler("user.repository", this);
						break;
					default:
						fail("invalid.action");
				}
			}
		}, new AsyncResultHandler<Void>() {
			@Override
			public void handle(AsyncResult<Void> event) {
				if (event.succeeded()) {
					eb.send("entcore.feeder", new JsonObject().putString("action", "transition"),
							new Handler<Message<JsonObject>>() {
						@Override
						public void handle(Message<JsonObject> message) {
							assertEquals("ok", message.body().getString("status"));
						}
					});
				} else {
					fail();
				}
			}
		});
	}

	private void importAAF(final VoidHandler handler) {
		eb.send("entcore.feeder", new JsonObject().putString("action", "import"), new Handler<Message<JsonObject>>() {
			@Override
			public void handle(Message<JsonObject> message) {
				assertEquals("ok", message.body().getString("status"));
				String countQuery =
						"MATCH (:User) WITH count(*) as nbUsers " +
						"MATCH (:Structure) WITH count(*) as nbStructures, nbUsers " +
						"MATCH (:Class) WITH nbUsers, nbStructures, count(*) as nbClasses " +
						"MATCH (:FunctionalGroup) WITH nbUsers, nbStructures, nbClasses, count(*) as nbFunctionalGroups " +
						"MATCH (:ProfileGroup) " +
						"RETURN nbUsers, nbStructures, nbClasses, nbFunctionalGroups, count(*) as nbProfileGroups";
				neo4j.execute(countQuery, new JsonObject(), new Handler<Message<JsonObject>>() {
					@Override
					public void handle(Message<JsonObject> event) {
						assertEquals("ok", event.body().getString("status"));
						JsonObject r = event.body().getArray("result").get(0);
						assertEquals(15290, (int) r.getInteger("nbUsers", 0));
						assertEquals(10, (int) r.getInteger("nbStructures", 0));
						assertEquals(177, (int) r.getInteger("nbClasses", 0));
						assertEquals(177, (int) r.getInteger("nbFunctionalGroups", 0));
						assertEquals(177 * 4 + 10 * 4 + 4, (int) r.getInteger("nbProfileGroups", 0));
						handler.handle(null);
					}
				});
			}
		});
	}

	private void importUpdate(final VoidHandler handler) {
		eb.registerHandler("user.repository", new Handler<Message<JsonObject>>() {
			@Override
			public void handle(Message<JsonObject> message) {
				String action = message.body().getString("action", "");
				switch (action) {
					case "delete-users":
						JsonArray users = message.body().getArray("old-users", new JsonArray());
						assertEquals(3972 + 698, users.size());
						String countQuery = "MATCH (:User) RETURN count(*) as nbUsers ";
						neo4j.execute(countQuery, new JsonObject(), new Handler<Message<JsonObject>>() {
							@Override
							public void handle(Message<JsonObject> event) {
								assertEquals("ok", event.body().getString("status"));
								JsonObject r = event.body().getArray("result").get(0);
								assertEquals(15290 - 3972 - 698, (int) r.getInteger("nbUsers", 0));
								handler.handle(null);
							}
						});
						break;
					default:
						fail("invalid.action : " + action);
				}
			}
		}, new AsyncResultHandler<Void>() {
			@Override
			public void handle(AsyncResult<Void> event) {
				if (event.succeeded()) {
					eb.send("entcore.feeder", new JsonObject().putString("action", "import"),
							new Handler<Message<JsonObject>>() {
								@Override
								public void handle(Message<JsonObject> message) {
									assertEquals("ok", message.body().getString("status"));
									String countQuery =
											"MATCH (u:User) " +
											"WHERE HAS(u.disappearanceDate) " +
											"RETURN count(*) as nbUsers ";
									neo4j.execute(countQuery, new JsonObject(), new Handler<Message<JsonObject>>() {
										@Override
										public void handle(Message<JsonObject> event) {
											assertEquals("ok", event.body().getString("status"));
											JsonObject r = event.body().getArray("result").get(0);
											assertEquals(3972 + 698, (int) r.getInteger("nbUsers", 0));
										}
									});
								}
							});
				} else {
					fail();
				}
			}
		});
	}

}