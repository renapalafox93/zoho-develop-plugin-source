/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { blue, yellow } from 'chalk';
import { UX } from '@salesforce/command';
import { Logger, Messages } from '@salesforce/core';
import { get, getString, getNumber } from '@salesforce/ts-types';
import { RetrieveResult, MetadataApiRetrieveStatus } from '@salesforce/source-deploy-retrieve';
import {
  ComponentStatus,
  FileResponse,
  RequestStatus,
  RetrieveMessage,
} from '@salesforce/source-deploy-retrieve/lib/src/client/types';
import { ResultFormatter, ResultFormatterOptions } from './resultFormatter';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/plugin-source', 'retrieve');

export interface PackageRetrieval {
  name: string;
  path: string;
}

export interface RetrieveCommandResult {
  inboundFiles: FileResponse[];
  packages: PackageRetrieval[];
  warnings: RetrieveMessage[];
  response: MetadataApiRetrieveStatus;
}

export class RetrieveResultFormatter extends ResultFormatter {
  protected result: RetrieveResult;
  protected fileResponses: FileResponse[];
  protected warnings: RetrieveMessage[];

  public constructor(logger: Logger, ux: UX, options: ResultFormatterOptions, result: RetrieveResult) {
    super(logger, ux, options);
    this.result = result;
    this.fileResponses = result?.getFileResponses ? result.getFileResponses() : [];
    const warnMessages = get(result, 'response.messages', []) as RetrieveMessage | RetrieveMessage[];
    this.warnings = Array.isArray(warnMessages) ? warnMessages : [warnMessages];
  }

  /**
   * Get the JSON output from the RetrieveResult.
   *
   * @returns RetrieveCommandResult
   */
  public getJson(): RetrieveCommandResult {
    return {
      inboundFiles: this.fileResponses,
      packages: [],
      warnings: this.warnings,
      response: this.result.response,
    };
  }

  /**
   * Displays retrieve results in human format.
   */
  public display(): void {
    if (this.hasStatus(RequestStatus.InProgress)) {
      const commandWaitTime = getNumber(this.options, 'waitTime', 33);
      this.ux.log(messages.getMessage('retrieveTimeout', [commandWaitTime]));
      return;
    }

    if (this.isSuccess()) {
      if (this.warnings.length) {
        this.displayWarnings();
      }
      this.ux.styledHeader(blue(messages.getMessage('retrievedSourceHeader')));
      const retrievedFiles = this.fileResponses.filter((fr) => fr.state !== ComponentStatus.Failed);
      if (retrievedFiles?.length) {
        this.displaySuccesses(retrievedFiles);
      } else {
        this.ux.log(messages.getMessage('NoResultsFound'));
      }
    } else {
      this.displayErrors();
    }

    // Display any package retrievals
    // if (results.packages && results.packages.length) {
    //   this.logger.styledHeader(this.logger.color.blue('Retrieved Packages'));
    //   results.packages.forEach(pkg => {
    //     this.logger.log(`${pkg.name} package converted and retrieved to: ${pkg.path}`);
    //   });
    //   this.logger.log('');
    // }
  }

  protected hasStatus(status: RequestStatus): boolean {
    return getString(this.result, 'response.status') === status;
  }

  protected hasComponents(): boolean {
    return getNumber(this.result, 'components.size', 0) === 0;
  }

  private displayWarnings(): void {
    this.ux.styledHeader(yellow(messages.getMessage('retrievedSourceWarningsHeader')));
    const columns = [
      { key: 'fileName', label: 'FILE NAME' },
      { key: 'problem', label: 'PROBLEM' },
    ];
    this.ux.table(this.warnings, { columns });
    this.ux.log();
  }

  private displaySuccesses(retrievedFiles: FileResponse[]): void {
    this.sortFileResponses(retrievedFiles);
    this.asRelativePaths(retrievedFiles);
    const columns = [
      { key: 'fullName', label: 'FULL NAME' },
      { key: 'type', label: 'TYPE' },
      { key: 'filePath', label: 'PROJECT PATH' },
    ];
    this.ux.table(retrievedFiles, { columns });
  }

  private displayErrors(): void {
    const unknownMsg: RetrieveMessage[] = [{ fileName: 'unknown', problem: 'unknown' }];
    const responseMsgs = get(this.result, 'response.messages', unknownMsg) as RetrieveMessage | RetrieveMessage[];
    const errMsgs = Array.isArray(responseMsgs) ? responseMsgs : [responseMsgs];
    const errMsgsForDisplay = errMsgs.reduce<string>((p, c) => `${p}\n${c.fileName}: ${c.problem}`, '');
    this.ux.log(`Retrieve Failed due to: ${errMsgsForDisplay}`);
  }
}