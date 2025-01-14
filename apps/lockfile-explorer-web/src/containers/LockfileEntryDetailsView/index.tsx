// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React, { useCallback, useEffect, useState } from 'react';
import { ScrollArea, Text } from '@rushstack/rush-themed-ui';
import styles from './styles.scss';
import appStyles from '../../App.scss';
import { IDependencyType, LockfileDependency } from '../../parsing/LockfileDependency';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { pushToStack, selectCurrentEntry } from '../../store/slices/entrySlice';
import { ReactNull } from '../../types/ReactNull';
import { LockfileEntry } from '../../parsing/LockfileEntry';
import { logDiagnosticInfo } from '../../helpers/logDiagnosticInfo';
import { displaySpecChanges } from '../../helpers/displaySpecChanges';

enum DependencyType {
  Determinant,
  TransitiveReferrer
}

interface IInfluencerType {
  entry: LockfileEntry;
  type: DependencyType;
}

export const LockfileEntryDetailsView = (): JSX.Element | ReactNull => {
  const selectedEntry = useAppSelector(selectCurrentEntry);
  const specChanges = useAppSelector((state) => state.workspace.specChanges);
  const dispatch = useAppDispatch();

  const [inspectDependency, setInspectDependency] = useState<LockfileDependency | null>(null);
  const [influencers, setInfluencers] = useState<IInfluencerType[]>([]);

  useEffect(() => {
    if (selectedEntry) {
      setInspectDependency(null);
    }
  }, [selectedEntry]);

  const selectResolvedEntry = useCallback(
    (dependencyToTrace) => () => {
      if (inspectDependency && inspectDependency.entryId === dependencyToTrace.entryId) {
        if (dependencyToTrace.resolvedEntry) {
          dispatch(pushToStack(dependencyToTrace.resolvedEntry));
        } else {
          logDiagnosticInfo('No resolved entry for dependency:', dependencyToTrace);
        }
      } else if (selectedEntry) {
        console.log('dependency to trace: ', dependencyToTrace);
        setInspectDependency(dependencyToTrace);

        // Check if we need to calculate influencers.
        // If the current dependencyToTrace is a peer dependency then we do
        if (dependencyToTrace.dependencyType !== IDependencyType.PEER_DEPENDENCY) {
          return;
        }

        // calculate influencers
        const stack = [selectedEntry];
        const determinants = new Set<LockfileEntry>();
        const transitiveReferrers = new Set<LockfileEntry>();
        const visitedNodes = new Set<LockfileEntry>();
        visitedNodes.add(selectedEntry);
        while (stack.length) {
          const currEntry = stack.pop();
          if (currEntry) {
            for (const referrer of currEntry.referrers) {
              let hasDependency = false;
              for (const dependency of referrer.dependencies) {
                if (dependency.name === dependencyToTrace.name) {
                  determinants.add(referrer);
                  hasDependency = true;
                  break;
                }
              }
              if (!hasDependency) {
                if (referrer.transitivePeerDependencies.has(dependencyToTrace.name)) {
                  transitiveReferrers.add(referrer);
                } else {
                  // Since this referrer does not declare "dependency", it is a
                  // transitive peer dependency, and we call the referrer a "transitive referrer".
                  // PNPM should have added it to the "transitivePeerDependencies" list in the
                  // YAML file.  If not, either something is wrong with our algorithm, or else
                  // something has changed about how PNPM manages its "transitivePeerDependencies"
                  // field.
                  console.error(
                    'Error analyzing influencers: A referrer appears to be missing its "transitivePeerDependencies" field in the YAML file: ',
                    dependencyToTrace,
                    referrer,
                    currEntry
                  );
                }
                for (const referrer of currEntry.referrers) {
                  if (!visitedNodes.has(referrer)) {
                    stack.push(referrer);
                    visitedNodes.add(referrer);
                  }
                }
              }
            }
          }
        }
        const influencers: IInfluencerType[] = [];
        for (const determinant of determinants.values()) {
          influencers.push({
            entry: determinant,
            type: DependencyType.Determinant
          });
        }
        for (const referrer of transitiveReferrers.values()) {
          influencers.push({
            entry: referrer,
            type: DependencyType.TransitiveReferrer
          });
        }
        setInfluencers(influencers);
      }
    },
    [selectedEntry, inspectDependency]
  );

  const selectResolvedReferencer = useCallback(
    (referrer) => () => {
      dispatch(pushToStack(referrer));
    },
    [selectedEntry]
  );

  const renderDependencyMetadata = (): JSX.Element | ReactNull => {
    if (!inspectDependency) {
      return ReactNull;
    }
    return (
      <div className={`${styles.DependencyDetails}`}>
        <ScrollArea>
          <div className={styles.DependencyDetailInfo}>
            <Text type="h5" bold>
              Selected&nbsp;Dependency:{' '}
            </Text>
            <Text type="span">
              {inspectDependency.name}: {inspectDependency.version}
            </Text>
          </div>
          <div className={styles.DependencyDetailInfo}>
            <Text type="h5" bold>
              package.json spec:{' '}
            </Text>
            <Text type="span">
              {inspectDependency.dependencyType === IDependencyType.PEER_DEPENDENCY
                ? `"${inspectDependency.peerDependencyMeta.version}" ${
                    inspectDependency.peerDependencyMeta.optional ? 'Optional' : 'Required'
                  } Peer`
                : inspectDependency.version}
            </Text>
          </div>
          <div className={styles.DependencyDetailInfo}>
            <Text type="h5" bold>
              .pnpmfile.cjs:{' '}
            </Text>
            <Text type="span">
              {specChanges.has(inspectDependency.name)
                ? displaySpecChanges(specChanges, inspectDependency.name)
                : 'No Effect'}
            </Text>
          </div>
        </ScrollArea>
      </div>
    );
  };

  const renderPeerDependencies = (): JSX.Element | ReactNull => {
    if (!selectedEntry) return ReactNull;
    const peerDeps = selectedEntry.dependencies.filter(
      (d) => d.dependencyType === IDependencyType.PEER_DEPENDENCY
    );
    if (!peerDeps.length) {
      return (
        <div className={`${appStyles.ContainerCard} ${styles.InfluencerList}`}>
          <Text type="h5">No peer dependencies.</Text>
        </div>
      );
    }
    if (!inspectDependency || inspectDependency.dependencyType !== IDependencyType.PEER_DEPENDENCY) {
      return (
        <div className={`${appStyles.ContainerCard} ${styles.InfluencerList}`}>
          <Text type="h5">Select a peer dependency to view its influencers</Text>
        </div>
      );
    }

    const determinants = influencers.filter((inf) => inf.type === DependencyType.Determinant);
    const transitiveReferrers = influencers.filter((inf) => inf.type === DependencyType.TransitiveReferrer);

    return (
      <div className={`${appStyles.ContainerCard} ${styles.InfluencerList}`}>
        <ScrollArea>
          <Text type="h5" bold>
            Determinants:
          </Text>
          {determinants.length ? (
            determinants.map(({ entry }) => (
              <a
                className={styles.InfluencerEntry}
                key={entry.rawEntryId}
                onClick={selectResolvedReferencer(entry)}
              >
                {entry.displayText}
              </a>
            ))
          ) : (
            <Text type="p">(none)</Text>
          )}
          <Text type="h5" bold className={styles.TransitiveReferencersHeader}>
            Transitive Referencers:
          </Text>
          {transitiveReferrers.length ? (
            transitiveReferrers.map(({ entry }) => (
              <a
                className={styles.InfluencerEntry}
                key={entry.rawEntryId}
                onClick={selectResolvedReferencer(entry)}
              >
                {entry.displayText}
              </a>
            ))
          ) : (
            <Text type="p">(none)</Text>
          )}
        </ScrollArea>
      </div>
    );
  };

  if (!selectedEntry) {
    return (
      <div className={`${appStyles.ContainerCard} ${styles.InfluencerList}`}>
        <Text type="h5" bold>
          Select an entry to view its details
        </Text>
      </div>
    );
  }

  return (
    <>
      <div className={styles.LockfileEntryListView}>
        <div className={appStyles.ContainerCard}>
          <Text type="h4" bold>
            Direct Referrers
          </Text>
          <div className={styles.DependencyListWrapper}>
            <ScrollArea>
              {selectedEntry.referrers?.map((referrer: LockfileEntry) => (
                <div
                  className={styles.DependencyItem}
                  key={referrer.rawEntryId}
                  onClick={selectResolvedReferencer(referrer)}
                >
                  <Text type="h5" bold>
                    Name: {referrer.displayText}
                  </Text>
                  <div>
                    <Text type="p">Entry ID: {referrer.rawEntryId}</Text>
                  </div>
                </div>
              ))}
            </ScrollArea>
          </div>
        </div>
        <div className={appStyles.ContainerCard}>
          <Text type="h4" bold>
            Direct Dependencies
          </Text>
          <div className={styles.DependencyListWrapper}>
            <ScrollArea>
              {selectedEntry.dependencies?.map((dependency: LockfileDependency) => (
                <div
                  className={`${styles.DependencyItem} ${
                    inspectDependency?.entryId === dependency.entryId && styles.SelectedDependencyItem
                  }`}
                  key={dependency.entryId || dependency.name}
                  onClick={selectResolvedEntry(dependency)}
                >
                  <Text type="h5" bold>
                    Name: {dependency.name}{' '}
                    {dependency.dependencyType === IDependencyType.PEER_DEPENDENCY
                      ? `${
                          dependency.peerDependencyMeta.optional ? '(Optional)' : '(Non-optional)'
                        } Peer Dependency`
                      : ''}
                  </Text>
                  <div>
                    <Text type="p">Version: {dependency.version}</Text>
                    <Text type="p">Entry ID: {dependency.entryId}</Text>
                  </div>
                </div>
              ))}
            </ScrollArea>
          </div>
        </div>
      </div>
      {renderDependencyMetadata()}
      {renderPeerDependencies()}
    </>
  );
};
