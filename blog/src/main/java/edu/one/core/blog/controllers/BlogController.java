package edu.one.core.blog.controllers;

import static edu.one.core.blog.controllers.BlogResponseHandler.*;

import edu.one.core.blog.services.BlogService;
import edu.one.core.blog.services.impl.DefaultBlogService;
import edu.one.core.infra.Controller;

import java.util.*;

import edu.one.core.infra.Either;
import edu.one.core.infra.MongoDb;
import edu.one.core.infra.Utils;
import edu.one.core.infra.http.Renders;
import edu.one.core.infra.security.UserUtils;
import edu.one.core.infra.security.resources.UserInfos;
import edu.one.core.security.ActionType;
import edu.one.core.security.SecuredAction;
import org.vertx.java.core.Handler;
import org.vertx.java.core.Vertx;
import org.vertx.java.core.VoidHandler;
import org.vertx.java.core.http.HttpServerRequest;
import org.vertx.java.core.http.RouteMatcher;
import org.vertx.java.core.json.JsonArray;
import org.vertx.java.core.json.JsonObject;
import org.vertx.java.platform.Container;

public class BlogController extends Controller {

	private final BlogService blog;
	private final List<String> managerActions;

	public BlogController(Vertx vertx, Container container,
		RouteMatcher rm, Map<String, edu.one.core.infra.security.SecuredAction> securedActions,
		MongoDb mongo) {
		super(vertx, container, rm, securedActions);
		this.blog = new DefaultBlogService(mongo);
		this.managerActions = loadManagerActions(securedActions.values());
	}

	@SecuredAction("blog.view")
	public void blog(HttpServerRequest request) {
		renderView(request);
	}

	// TODO improve fields matcher and validater
	@SecuredAction("blog.create")
	public void create(final HttpServerRequest request) {
		UserUtils.getUserInfos(eb, request, new Handler<UserInfos>() {
			@Override
			public void handle(final UserInfos user) {
				if (user != null) {
					request.expectMultiPart(true);
					request.endHandler(new VoidHandler() {
						@Override
						protected void handle() {
							blog.create(Utils.jsonFromMultimap(request.formAttributes()), user,
									defaultResponseHandler(request));
						}
					});
				} else {
					unauthorized(request);
				}
			}
		});
	}

	@SecuredAction(value = "blog.manager", type = ActionType.RESOURCE)
	public void update(final HttpServerRequest request) {
		final String blogId = request.params().get("blogId");
		if (blogId == null || blogId.trim().isEmpty()) {
			badRequest(request);
			return;
		}
		request.expectMultiPart(true);
		request.endHandler(new VoidHandler() {
			@Override
			protected void handle() {
				blog.update(blogId, Utils.jsonFromMultimap(request.formAttributes()),
						defaultResponseHandler(request));
			}
		});
	}

	@SecuredAction(value = "blog.manager", type = ActionType.RESOURCE)
	public void delete(final HttpServerRequest request) {
		final String blogId = request.params().get("blogId");
		if (blogId == null || blogId.trim().isEmpty()) {
			badRequest(request);
			return;
		}
		blog.delete(blogId, defaultResponseHandler(request, 204));
	}

	@SecuredAction(value = "blog.read", type = ActionType.RESOURCE)
	public void get(final HttpServerRequest request) {
		final String blogId = request.params().get("blogId");
		if (blogId == null || blogId.trim().isEmpty()) {
			badRequest(request);
			return;
		}
		blog.get(blogId, defaultResponseHandler(request));
	}

	@SecuredAction("blog.list")
	public void list(final HttpServerRequest request) {
		UserUtils.getUserInfos(eb, request, new Handler<UserInfos>() {
			@Override
			public void handle(final UserInfos user) {
				if (user != null) {
					blog.list(user, arrayResponseHandler(request));
				} else {
					unauthorized(request);
				}
			}
		});
	}

	@SecuredAction(value = "blog.manager", type = ActionType.RESOURCE)
	public void share(final HttpServerRequest request) {
		final String blogId = request.params().get("blogId");
		if (blogId == null || blogId.trim().isEmpty()) {
			badRequest(request);
			return;
		}
		blog.shared(blogId, new Handler<Either<String, JsonObject>>() {
			@Override
			public void handle(Either<String, JsonObject> event) {
				if (event.isRight() &&  event.right().getValue().getArray("shared") != null) {
					JsonArray shared = event.right().getValue().getArray("shared");
					List<String> checked = new ArrayList<>();
					if (shared != null && shared.size() > 0) {
						for (Object o : shared) {
							JsonObject userShared = (JsonObject) o;
							String groupId = userShared.getString("groupId");
							for (String attrName : userShared.getFieldNames()) {
								if ("userId".equals(attrName)) continue;
								if ("groupId".equals(attrName)) continue;
								if ("manager".equals(attrName)) {
									for (String m: managerActions) {
										checked.add(m + "_" + groupId);
									}
									continue;
								}
								if (userShared.getBoolean(attrName, false)) {
									checked.add(attrName + "_" + groupId);
								}
							}
						}
					}
					shareGroupResource(request, blogId, checked);
				} else {
					notFound(request);
				}
			}
		});
	}

	@SecuredAction(value = "blog.manager", type = ActionType.RESOURCE)
	public void shareSubmit(final HttpServerRequest request) {
		final String blogId = request.params().get("blogId");
		request.expectMultiPart(true);
		request.endHandler(new VoidHandler() {
			@Override
			protected void handle() {
				final String id = request.formAttributes().get("resourceId");
				if (blogId == null || blogId.trim().isEmpty() || !blogId.equals(id)) {
					badRequest(request);
					return;
				}
				UserUtils.findVisibleProfilsGroups(eb, request, new Handler<JsonArray>() {
					@Override
					public void handle(JsonArray visibleGroups) {
						final List<String> shareGroups = request.formAttributes().getAll("shareGroups");
						final List<String> visibleGroupsIds = new ArrayList<>();
						for (int i = 0; i < visibleGroups.size(); i++) {
							JsonObject j = visibleGroups.get(i);
							if (j != null && j.getString("id") != null) {
								visibleGroupsIds.add(j.getString("id"));
							}
						}
						Map<String, JsonObject> sharesMap = new HashMap<>();
						for (String shareGroup : shareGroups) {
							String [] s = shareGroup.split("_");
							if (s.length != 2) continue;
							String [] actions = s[0].split(",");
							if (actions.length < 1) continue;
							if (!visibleGroupsIds.contains(s[1])) continue;
							if (Arrays.asList(actions).containsAll(managerActions)) {
								JsonObject j = sharesMap.get(s[1]);
								if (j == null) {
									j = new JsonObject().putString("groupId", s[1]);
									sharesMap.put(s[1], j);
								}
								j.putBoolean("manager", true);
							} else {
								for (int i = 0; i < actions.length; i++) {
									JsonObject j = sharesMap.get(s[1]);
									if (j == null) {
										j = new JsonObject().putString("groupId", s[1]);
										sharesMap.put(s[1], j);
									}
									j.putBoolean(actions[i].replaceAll("\\.", "-"), true);
								}
							}
						}
						final JsonArray sharedArray = new JsonArray();
						for (JsonObject jo: sharesMap.values()) {
							sharedArray.add(jo);
						}
						blog.share(blogId, sharedArray, visibleGroupsIds, defaultResponseHandler(request));
					}
				});
			}
		});
	}

	private List<String> loadManagerActions(Collection<edu.one.core.infra.security.SecuredAction> actions) {
		List<String> managerActions = new ArrayList<>();
		if (actions != null) {
			for (edu.one.core.infra.security.SecuredAction a: actions) {
				if (a.getName() != null && "RESOURCE".equals(a.getType()) &&
						"blog.manager".equals(a.getDisplayName())) {
					managerActions.add(a.getName().replaceAll("\\.", "-"));
				}
			}
		}
		return  managerActions;
	}

}