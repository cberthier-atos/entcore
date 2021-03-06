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

package org.entcore.common.neo4j;


import org.vertx.java.core.json.JsonArray;
import org.vertx.java.core.json.JsonObject;

import java.util.Map;

public class StatementsBuilder {

	private final JsonArray statements;

	public StatementsBuilder() {
		this.statements = new JsonArray();
	}

	public StatementsBuilder add(String query, JsonObject params) {
		if (query != null && !query.trim().isEmpty()) {
			JsonObject statement = new JsonObject().putString("statement", query);
			if (params != null) {
				statement.putObject("parameters", params);
			}
			statements.addObject(statement);
		}
		return this;
	}

	public StatementsBuilder add(String query, Map<String, Object> params) {
		return add(query, new JsonObject(params));
	}

	public StatementsBuilder add(String query) {
		return add(query, (JsonObject) null);
	}

	public JsonArray build() {
		return statements;
	}

}
