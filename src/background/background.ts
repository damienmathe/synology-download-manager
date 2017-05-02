import { TaskPoller } from '../taskPoller';
import { getHostUrl, onStoredStateChange } from '../common';

const poller = new TaskPoller;
const START_TIME = Date.now();

let finishedTaskIds: string[] | undefined;

onStoredStateChange(storedState => {
  poller.updateSettings({
    hostname: getHostUrl(storedState.connection),
    sid: storedState.sid,
    interval: storedState.notifications.pollingInterval,
    enabled: storedState.notifications.enabled
  });
});

onStoredStateChange(storedState => {
  if (storedState.cachedTasks.updateTimestamp > START_TIME) {
    const updatedFinishedTaskIds = storedState.cachedTasks.tasks
      .filter(t => t.status === 'finished' || t.status === 'seeding')
      .map(t => t.id);
    if (finishedTaskIds != null) {
      const newlyFinishedTaskIds = updatedFinishedTaskIds.filter(id => finishedTaskIds!.indexOf(id) === -1);
      newlyFinishedTaskIds.forEach(id => {
        const task = storedState.cachedTasks.tasks.filter(t => t.id === id)[0];
        browser.notifications.create(undefined, {
          type: 'basic',
          title: `${task.title}`,
          message: 'Download finished'
        });
      });
    }
    finishedTaskIds = updatedFinishedTaskIds;
  }
});
