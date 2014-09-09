/* Copyright © WebServices pour l'Éducation, 2014
 *
 * This file is part of ENT Core. ENT Core is a versatile ENT engine based on the JVM.
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation (version 3 of the License).
 *
 * For the sake of explanation, any module that communicate over native
 * Web protocols, such as HTTP, with ENT Core is outside the scope of this
 * license and could be license under its own terms. This is merely considered
 * normal use of ENT Core, and does not fall under the heading of "covered work".
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 */

package org.entcore.directory.services.impl;

import fr.wseduc.webutils.Either;
import fr.wseduc.webutils.NotificationHelper;
import org.entcore.common.neo4j.Neo;
import org.entcore.common.neo4j.Neo4j;
import org.entcore.common.user.UserInfos;
import org.entcore.directory.Directory;
import org.entcore.directory.services.UserService;
import org.vertx.java.core.Handler;
import org.vertx.java.core.eventbus.EventBus;
import org.vertx.java.core.eventbus.Message;
import org.vertx.java.core.http.HttpServerRequest;
import org.vertx.java.core.json.JsonArray;
import org.vertx.java.core.json.JsonObject;
import org.vertx.java.core.logging.Logger;
import org.vertx.java.core.logging.impl.LoggerFactory;

import java.util.List;

import static org.entcore.common.neo4j.Neo4jResult.*;
import static org.entcore.common.user.DefaultFunctions.ADMIN_LOCAL;
import static org.entcore.common.user.DefaultFunctions.CLASS_ADMIN;
import static org.entcore.common.user.DefaultFunctions.SUPER_ADMIN;

public class DefaultUserService implements UserService {

	private final Neo4j neo = Neo4j.getInstance();
	private final NotificationHelper notification;
	private final EventBus eb;
	private Logger logger = LoggerFactory.getLogger(DefaultUserService.class);

	public DefaultUserService(NotificationHelper notification, EventBus eb) {
		this.notification = notification;
		this.eb = eb;
	}

	@Override
	public void createInStructure(String structureId, JsonObject user, Handler<Either<String, JsonObject>> result) {
		JsonObject action = new JsonObject()
				.putString("action", "manual-create-user")
				.putString("structureId", structureId)
				.putString("profile", user.getString("type"))
				.putObject("data", user);
		eb.send(Directory.FEEDER, action, validUniqueResultHandler(result));
	}

	@Override
	public void createInClass(String classId, JsonObject user, Handler<Either<String, JsonObject>> result) {
		JsonObject action = new JsonObject()
				.putString("action", "manual-create-user")
				.putString("classId", classId)
				.putString("profile", user.getString("type"))
				.putObject("data", user);
		eb.send(Directory.FEEDER, action, validUniqueResultHandler(result));
	}

	@Override
	public void update(final String id, final JsonObject user, final Handler<Either<String, JsonObject>> result) {
		JsonObject action = new JsonObject()
				.putString("action", "manual-update-user")
				.putString("userId", id)
				.putObject("data", user);
		eb.send(Directory.FEEDER, action, validUniqueResultHandler(result));
	}

	@Override
	public void sendUserCreatedEmail(final HttpServerRequest request, String userId,
			final Handler<Either<String, Boolean>> result) {
		String query =
				"MATCH (u:`User` { id : {id}}) WHERE NOT(u.email IS NULL) AND NOT(u.activationCode IS NULL) " +
				"RETURN u.login as login, u.email as email, u.activationCode as activationCode ";
		JsonObject params = new JsonObject().putString("id", userId);
		neo.execute(query, params, new Handler<Message<JsonObject>>() {
			@Override
			public void handle(Message<JsonObject> m) {
				Either<String, JsonObject> r = validUniqueResult(m);
				if (r.isRight()) {
					JsonObject j = r.right().getValue();
					String email = j.getString("email");
					String login = j.getString("login");
					String activationCode = j.getString("activationCode");
					if (email == null || login == null || activationCode == null ||
							email.trim().isEmpty() || login.trim().isEmpty() || activationCode.trim().isEmpty()) {
						result.handle(new Either.Left<String, Boolean>("user.invalid.values"));
						return;
					}
					JsonObject json = new JsonObject()
							.putString("activationUri", notification.getHost() +
									"/auth/activation?login=" + login +
									"&activationCode=" + activationCode)
							.putString("host", notification.getHost())
							.putString("login", login);
					logger.debug(json.encode());
					notification.sendEmail(request, email, null, null,
							"email.user.created.info", "email/userCreated.html", json, true,
							new Handler<Message<JsonObject>>() {

								@Override
								public void handle(Message<JsonObject> message) {
									if ("ok".equals(message.body().getString("status"))) {
										result.handle(new Either.Right<String, Boolean>(true));
									} else {
										result.handle(new Either.Left<String, Boolean>(
												message.body().getString("message")));
									}
								}
							});
				} else {
					result.handle(new Either.Left<String, Boolean>(r.left().getValue()));
				}
			}
		});
	}

	@Override
	public void get(String id, Handler<Either<String, JsonObject>> result) {
		String query =
				"MATCH (u:`User` { id : {id}}) " +
				"OPTIONAL MATCH u-[:IN]->(pg:ProfileGroup)-[:HAS_PROFILE]->(p:Profile) " +
				"RETURN DISTINCT COLLECT(p.name) as type, u";
		neo.execute(query, new JsonObject().putString("id", id), fullNodeMergeHandler("u", result));
	}

	@Override
	public void list(String structureId, String classId, JsonArray expectedProfiles,
			Handler<Either<String, JsonArray>> results) {
		JsonObject params = new JsonObject();
		String filterProfile = "";
		String filterStructure = "";
		String filterClass = "";
		if (expectedProfiles != null && expectedProfiles.size() > 0) {
			filterProfile = "WHERE p.name IN {expectedProfiles} ";
			params.putArray("expectedProfiles", expectedProfiles);
		}
		if (classId != null && !classId.trim().isEmpty()) {
			filterClass = "(g:ProfileGroup)-[:DEPENDS]->(n:Class {id : {classId}}), ";
			params.putString("classId", classId);
		} else if (structureId != null && !structureId.trim().isEmpty()) {
			filterStructure = "(pg:ProfileGroup)-[:DEPENDS]->(n:Structure {id : {structureId}}), ";
			params.putString("structureId", structureId);
		}
		String query =
				"MATCH " +filterClass + filterStructure +
				"(u:User)-[:IN]->g-[:DEPENDS*0..1]->pg-[:HAS_PROFILE]->(p:Profile) " +
				filterProfile +
				"RETURN DISTINCT u.id as id, p.name as type, u.externalId as externalId, " +
				"u.activationCode as code, u.login as login, u.firstName as firstName, " +
				"u.lastName as lastName, u.displayName as displayName " +
				"ORDER BY type DESC, displayName ASC ";
		neo.execute(query, params, validResultHandler(results));
	}

	@Override
	public void listIsolated(String structureId, List<String> profile, Handler<Either<String, JsonArray>> results) {
		JsonObject params = new JsonObject();
		String query;
		// users without class
		if (structureId != null && !structureId.trim().isEmpty()) {
			query = "MATCH  (s:Structure { id : {structureId}})<-[:DEPENDS]-(g:ProfileGroup)<-[:IN]-(u:User), " +
					"g-[:HAS_PROFILE]->(p:Profile) " +
					"WHERE  NOT(u-[:IN]->()-[:DEPENDS]->(:Class)-[:BELONGS]->s) ";
			params.putString("structureId", structureId);
			if (profile != null && !profile.isEmpty()) {
				query += "AND p.name IN {profile} ";
				params.putArray("profile", new JsonArray(profile.toArray()));
			}
		} else { // users without structure
			query = "MATCH (u:User)" +
					"WHERE NOT(u-[:IN]->()-[:DEPENDS]->(:Structure)) " +
					"OPTIONAL MATCH u-[:IN]->(dpg:DefaultProfileGroup)-[:HAS_PROFILE]->(p:Profile) ";
		}
		query += "RETURN DISTINCT u.id as id, p.name as type, " +
				"u.activationCode as code, u.firstName as firstName," +
				"u.lastName as lastName, u.displayName as displayName " +
				"ORDER BY type DESC, displayName ASC ";
		neo.execute(query, params, validResultHandler(results));
	}

	@Override
	public void listAdmin(String structureId, String classId, String groupId,
						  JsonArray expectedProfiles, UserInfos userInfos, Handler<Either<String, JsonArray>> results) {
		JsonObject params = new JsonObject();
		String filter = "";
		String filterProfile = "WHERE 1=1 ";
		if (expectedProfiles != null && expectedProfiles.size() > 0) {
			filterProfile += "AND p.name IN {expectedProfiles} ";
			params.putArray("expectedProfiles", expectedProfiles);
		}
		if (classId != null && !classId.trim().isEmpty()) {
			filter = "(n:Class {id : {classId}})<-[:DEPENDS]-(g:ProfileGroup)<-[:IN]-";
			params.putString("classId", classId);
		} else if (structureId != null && !structureId.trim().isEmpty()) {
			filter = "(n:Structure {id : {structureId}})<-[:DEPENDS]-(g:ProfileGroup)<-[:IN]-";
			params.putString("structureId", structureId);
		} else if (groupId != null && !groupId.trim().isEmpty()) {
			filter = "(n:Group {id : {groupId}})<-[:IN]-";
			params.putString("groupId", groupId);
		}
		String condition = "";
		if (!userInfos.getFunctions().containsKey(SUPER_ADMIN) &&
				!userInfos.getFunctions().containsKey(ADMIN_LOCAL) &&
				!userInfos.getFunctions().containsKey(CLASS_ADMIN)) {
			results.handle(new Either.Left<String, JsonArray>("forbidden"));
			return;
		} else if (userInfos.getFunctions().containsKey(ADMIN_LOCAL)) {
			UserInfos.Function f = userInfos.getFunctions().get(ADMIN_LOCAL);
			List<String> structuresIds = f.getStructures();
			List<String> classesIds = f.getClasses();
			if (structuresIds != null && !structuresIds.isEmpty() && classesIds != null && !classesIds.isEmpty()) {
				condition = "AND (s.id IN {structures} OR c.id IN {classes}";
				params.putArray("structures", new JsonArray(structuresIds.toArray()));
				params.putArray("classes", new JsonArray(classesIds.toArray()));
			} else if (structuresIds != null && !structuresIds.isEmpty()) {
				condition = "AND (s.id IN {structures}";
				params.putArray("structures", new JsonArray(structuresIds.toArray()));
			} else if (classesIds != null && !classesIds.isEmpty()) {
				condition = "AND (c.id IN {classes}";
				params.putArray("classes", new JsonArray(classesIds.toArray()));
			}
		}
		if (!userInfos.getFunctions().containsKey(SUPER_ADMIN) &&
				userInfos.getFunctions().containsKey(CLASS_ADMIN)) {
			UserInfos.Function f = userInfos.getFunctions().get(CLASS_ADMIN);
			List<String> classesIds = f.getClasses();
			if (classesIds != null && !classesIds.isEmpty()) {
				if (condition.isEmpty()) {
					condition = "AND c.id IN {classes2} ";
				} else {
					condition += " OR c.id IN {classes2}) ";
				}
				params.putArray("classes2", new JsonArray(classesIds.toArray()));
			}
		} else if (!condition.isEmpty()) {
			condition += ") ";
		}
		String query =
				"MATCH " + filter + "(u:User) " +
				"WITH u " +
				"MATCH (s:Structure)<-[:DEPENDS]-(pg:ProfileGroup)-[:HAS_PROFILE]->(p:Profile), " +
				"(c:Class)<-[:DEPENDS]-(cpg:ProfileGroup)-[:DEPENDS]->pg, u-[:IN]->pg " +
				filterProfile + condition +
				"RETURN DISTINCT u.id as id, p.name as type, u.externalId as externalId, " +
				"u.activationCode as code, u.login as login, u.firstName as firstName, " +
				"u.lastName as lastName, u.displayName as displayName " +
				"ORDER BY type DESC, displayName ASC ";
		neo.execute(query, params, validResultHandler(results));
	}

	@Override
	public void delete(String id, Handler<Either<String, JsonObject>> result) {
		JsonObject action = new JsonObject()
				.putString("action", "manual-delete-user")
				.putString("userId", id);
		eb.send(Directory.FEEDER, action, validEmptyHandler(result));
	}

	@Override
	public void addFunction(String id, String functionCode, JsonArray structuresIds, JsonArray classesIds,
			Handler<Either<String, JsonObject>> result) {
		JsonObject action = new JsonObject()
				.putString("action", "manual-add-user-function")
				.putString("userId", id)
				.putString("function", functionCode)
				.putArray("structures", structuresIds)
				.putArray("classes", classesIds);
		eb.send(Directory.FEEDER, action, validEmptyHandler(result));
	}

	@Override
	public void removeFunction(String id, String functionCode, Handler<Either<String, JsonObject>> result) {
		JsonObject action = new JsonObject()
				.putString("action", "manual-remove-user-function")
				.putString("userId", id)
				.putString("function", functionCode);
		eb.send(Directory.FEEDER, action, validEmptyHandler(result));
	}

	@Override
	public void addGroup(String id, String groupId, Handler<Either<String, JsonObject>> result) {
		JsonObject action = new JsonObject()
				.putString("action", "manual-add-user-group")
				.putString("userId", id)
				.putString("groupId", groupId);
		eb.send(Directory.FEEDER, action, validEmptyHandler(result));
	}

	@Override
	public void removeGroup(String id, String groupId, Handler<Either<String, JsonObject>> result) {
		JsonObject action = new JsonObject()
				.putString("action", "manual-remove-user-group")
				.putString("userId", id)
				.putString("groupId", groupId);
		eb.send(Directory.FEEDER, action, validEmptyHandler(result));
	}

}
