package org.entcore.feeder.utils;

import org.vertx.java.core.Handler;
import org.vertx.java.core.Vertx;
import org.vertx.java.core.eventbus.Message;
import org.vertx.java.core.json.JsonArray;
import org.vertx.java.core.json.JsonObject;
import org.vertx.java.core.logging.Logger;
import org.vertx.java.core.logging.impl.LoggerFactory;

import java.util.Timer;
import java.util.TimerTask;
import java.util.concurrent.atomic.AtomicInteger;

public class TransactionHelper {

	private static final Logger log = LoggerFactory.getLogger(TransactionHelper.class);
	private final Neo4j neo4j;
	private JsonArray statements;
	private AtomicInteger remainingStatementNumber;
	private final int statementNumber;
	private Integer transactionId;
	private Timer resetTimeOutTimer;
	private Message<JsonObject> error;
	private boolean waitingQuery = false;
	private boolean commit = false;
	private Handler<Message<JsonObject>> commitHandler;
	private boolean flush = false;
	private Handler<Message<JsonObject>> flushHandler;

	class ResetTransactionTimer extends TimerTask {

		@Override
		public void run() {
			Integer tId = getTransactionId();
			if (tId != null) {
				neo4j.resetTransactionTimeout(tId, null);
			} else {
				cancel();
			}
		}

	}

	public TransactionHelper(Neo4j neo4j, int statementNumber) {
		this.neo4j = neo4j;
		this.remainingStatementNumber = new AtomicInteger(statementNumber);
		this.statementNumber = statementNumber;
		this.statements = new JsonArray();
		send(new JsonArray());
	}

	public void add(String query, JsonObject params) {
		if (!waitingQuery && transactionId != null &&
				remainingStatementNumber.getAndDecrement() == 0) {
			send(statements.copy());
			statements = new JsonArray();
			remainingStatementNumber = new AtomicInteger(statementNumber);
		}
		if (query != null && !query.trim().isEmpty()) {
			JsonObject statement = new JsonObject().putString("statement", query);
			if (params != null) {
				statement.putObject("parameters", params);
			}
			statements.addObject(statement);
		}
	}

	private void send(JsonArray s) {
		send(s, null);
	}

	private void send(JsonArray s, final Handler<Message<JsonObject>> handler) {
		if (error != null) {
			throw new IllegalStateException(error.body().getString("message"));
		}
		waitingQuery = true;
		neo4j.executeTransaction(s, transactionId, false, new Handler<Message<JsonObject>>() {
			@Override
			public void handle(Message<JsonObject> message) {
				if (handler != null) {
					handler.handle(message);
				}
				if ("ok".equals(message.body().getString("status"))) {
					Integer tId = message.body().getInteger("transactionId");
					if (transactionId == null && tId != null) {
						transactionId = tId;
						resetTimeOutTimer = new Timer();
						//resetTimeOutTimer.schedule(new ResetTransactionTimer(), 0, 55000); // TODO use transaction expires
					}
				} else {
					error = message;
					log.error(message.body().encode());
				}
				waitingQuery = false;
				if (commit) {
					commit(commitHandler);
				} else if (flush) {
					flush(flushHandler);
				}
			}
		});
	}

	public void commit(Handler<Message<JsonObject>> handler) {
		if (error != null) {
			throw new IllegalStateException(error.body().getString("message"));
		}
		if (waitingQuery) {
			commit = true;
			commitHandler = handler;
			return;
		}
		if (transactionId != null || statements.size() > 0) {
			neo4j.executeTransaction(statements, transactionId, true, handler);
			if (transactionId != null) {
				resetTimeOutTimer.cancel();
				resetTimeOutTimer.purge();
				transactionId = null;
			}
		} else if (handler != null) {
			handler.handle(null);
		}
	}

	public void rollback() {
		if (transactionId != null) {
			neo4j.rollbackTransaction(transactionId, null);
			resetTimeOutTimer.cancel();
			resetTimeOutTimer.purge();
			transactionId = null;
		}
	}

	public void flush(Handler<Message<JsonObject>> handler) {
		if (error != null) {
			throw new IllegalStateException(error.body().getString("message"));
		}
		if (waitingQuery) {
			flush = true;
			flushHandler = handler;
		} else if (transactionId != null) {
			send(statements.copy(), handler);
			statements = new JsonArray();
			remainingStatementNumber = new AtomicInteger(statementNumber);
		}
	}

	private Integer getTransactionId() {
		return transactionId;
	}

	public Neo4j getNeo4j() {
		return neo4j;
	}

}