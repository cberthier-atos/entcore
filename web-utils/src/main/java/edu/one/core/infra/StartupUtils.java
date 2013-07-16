package edu.one.core.infra;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FilenameFilter;
import java.io.IOException;

import org.vertx.java.core.Handler;
import org.vertx.java.core.eventbus.EventBus;
import org.vertx.java.core.eventbus.Message;
import org.vertx.java.core.json.JsonArray;
import org.vertx.java.core.json.JsonObject;

public class StartupUtils {

	public static void sendStartup(String appName, EventBus eb, String address,
			final Handler<Message<JsonObject>> handler) throws IOException {
		JsonArray actions = loadSecuredActions();
		JsonObject jo = new JsonObject();
		jo.putString("application", appName)
		.putArray("actions", actions);
		eb.send(address, jo, handler);
	}

	public static void sendStartup(String appName, EventBus eb, String address) throws IOException {
		sendStartup(appName, eb, address, null);
	}

	private static JsonArray loadSecuredActions() throws IOException {
		String path = StartupUtils.class.getClassLoader().getResource(".").getPath();
		File rootResources = new File(path);
		JsonArray securedActions = new JsonArray();
		if (!rootResources.isDirectory()) {
			return securedActions;
		}

		File[] actionsFiles = rootResources.listFiles(new FilenameFilter() {
			@Override
			public boolean accept(File dir, String name) {
				return name.startsWith("SecuredAction") && name.endsWith("json");
			}
		});

		for (File f : actionsFiles) {
			BufferedReader in = null;
			try {
				in = new BufferedReader(new FileReader(f));
				String line;
				while((line = in.readLine()) != null) {
					securedActions.add(new JsonObject(line));
				}
			} finally {
				if (in != null) {
					in.close();
				}
			}
		}
		return securedActions;
	}

}
