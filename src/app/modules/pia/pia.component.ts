import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, Params } from '@angular/router';
import { Subscription } from 'rxjs';
import { Answer } from 'src/app/models/answer.model';
import { Pia } from 'src/app/models/pia.model';
import { Revision } from 'src/app/models/revision.model';
import { ActionPlanService } from 'src/app/services/action-plan.service';
import { AnswerService } from 'src/app/services/answer.service';
import { AppDataService } from 'src/app/services/app-data.service';
import { DialogService } from 'src/app/services/dialog.service';
import { GlobalEvaluationService } from 'src/app/services/global-evaluation.service';
import { IntrojsService } from 'src/app/services/introjs.service';
import { KnowledgeBaseService } from 'src/app/services/knowledge-base.service';
import { MeasureService } from 'src/app/services/measures.service';
import { ModalsService } from 'src/app/services/modals.service';
import { PiaService } from 'src/app/services/pia.service';
import { RevisionService } from 'src/app/services/revision.service';
import { SidStatusService } from 'src/app/services/sid-status.service';

@Component({
  selector: 'app-pia',
  templateUrl: './pia.component.html',
  styleUrls: ['./pia.component.scss']
})
export class PiaComponent implements OnInit {
  section: { id: number; title: string; short_help: string; items: any };
  item: {
    id: number;
    title: string;
    evaluation_mode: string;
    short_help: string;
    questions: any;
  };
  data: { sections: any };
  questions: any;
  measureToRemoveFromTags: string;
  subscription: Subscription;
  public sideView = 'knowledge';
  public revisions = null;
  public revisionOverlay = false;
  public pia = null;
  public download = false;
  public preview;

  constructor(
    private route: ActivatedRoute,
    private modalsService: ModalsService,
    private appDataService: AppDataService,
    private sidStatusService: SidStatusService,
    private knowledgeBaseService: KnowledgeBaseService,
    public piaService: PiaService,
    private actionPlanService: ActionPlanService,
    private globalEvaluationService: GlobalEvaluationService,
    public revisionService: RevisionService,
    private measureService: MeasureService,
    private router: Router,
    private answerService: AnswerService,
    private introjsService: IntrojsService,
    private dialogService: DialogService
  ) {
    this.introjsService.entrySideViewChange.subscribe(value => {
      this.sideView = value;
    });
  }

  async ngOnInit() {
    this.appDataService.entrieMode = 'pia';
    let sectionId = parseInt(this.route.snapshot.params.section_id, 10);
    let itemId = parseInt(this.route.snapshot.params.item_id, 10);

    this.piaService.find(parseInt(this.route.snapshot.params.id))
      .then((pia: Pia) => {
        // INIT PIA

        this.pia = pia;
        if (!sectionId || !itemId) {
          this.router.navigate(['entry', this.pia.id, 'section', 1, 'item', 1]);
        } else {
          if (this.pia.structure_data) {
            this.appDataService.dataNav = this.pia.structure_data;
          } else {
            this.appDataService.resetDataNav();
          }
          this.data = this.appDataService.dataNav;

          this.route.params.subscribe((params: Params) => {
            sectionId = parseInt(params.section_id, 10);
            itemId = parseInt(params.item_id, 10);
            this.getSectionAndItem(sectionId, itemId);
            window.scroll(0, 0);
          });
        }

        // Suscribe to measure service messages
        this.subscription = this.measureService.behaviorSubject.subscribe(val => {
          this.measureToRemoveFromTags = val;
        });
      })
      .catch((err) => {
        console.error(err);
      });

  }

  ngDoCheck() {
    if (this.measureToRemoveFromTags && this.measureToRemoveFromTags.length > 0) {
      const measureName = this.measureToRemoveFromTags;
      this.measureToRemoveFromTags = null;

      // Update tags when removing measures from 3.1
      const itemsQuestions = [];
      this.pia.data.sections.forEach(section => {
        section.items.forEach(item => {
          if (item.questions) {
            itemsQuestions.push(
              item.questions.filter(question => {
                return question.answer_type === 'list' && question.is_measure === true;
              })
            );
          }
        });
      });

      // Keep only questions with measures lists
      const listQuestions = itemsQuestions.filter(v => Object.keys(v).length !== 0);

      // For each of these questions, get their respective answer
      listQuestions.forEach(questionsSet => {
        questionsSet.forEach(q => {
          // const answer = new Answer();
          this.answerService.getByReferenceAndPia(parseInt(this.route.snapshot.params.id), q.id)
            .then((answer: Answer) => {
              if (answer.data && answer.data.list.length > 0 && answer.data.list.includes(measureName)) {
                const index = answer.data.list.indexOf(measureName);
                answer.data.list.splice(index, 1);
                this.answerService.update(answer);
              }
            });
        });
      });
    }
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  /**
   * Get the current Section and Item and initialize others information.
   * @param sectionId - The section id.
   * @param itemId - The item id.
   */
  private async getSectionAndItem(sectionId: number, itemId: number) {
    if (this.pia.structure_data) {
      this.appDataService.dataNav = this.pia.structure_data;
    }
    this.data = this.appDataService.dataNav;
    this.section = this.data.sections.filter(section => {
      return section.id === sectionId;
    })[0];
    this.item = this.section.items.filter(item => {
      return item.id === itemId;
    })[0];

    this.globalEvaluationService.section = this.section;
    this.globalEvaluationService.item = this.item;

    this.questions = [];
    if (this.item.questions) {
      this.item.questions.forEach(question => {
        this.questions.push(question);
      });
    }

    this.piaService.find(parseInt(this.route.snapshot.params.id)).then((pia: Pia) => {
      this.globalEvaluationService.pia = pia;
      this.globalEvaluationService.validate();
      this.measureService.listMeasures(pia.id).then(() => {
        /* Modal for risks if no measures yet */
        let displayModal = true;
        if (this.section.id === 3 && (this.item.id === 2 || this.item.id === 3 || this.item.id === 4)) {
          if (this.measureService.measures.length > 0) {
            this.measureService.measures.forEach(element => {
              if (element.title && element.title.length > 0) {
                displayModal = false;
              }
            });
          }
          if (displayModal) {
            // this.modalsService.openModal('pia-declare-measures');
            this.dialogService.confirmThis(
              {
                text: 'modals.declare_measures.content',
                type: 'yes',
                yes: 'modals.declare_measures.declare',
                no: ''
              },
              () => {
                this.router.navigate(
                  ['/pia', 'piaService.pia.id', 'section', 3, 'item', 1]
                );
              },
              () => {
                return false;
              }
            );
          }
        }

        /* Modal for action plan if no evaluations yet */
        if (this.section.id === 4 && this.item.id === 2 && !this.sidStatusService.verifEnableActionPlan()) {
          // this.modalsService.openModal('pia-action-plan-no-evaluation');
          this.dialogService.confirmThis(
            {
              text: 'modals.action_plan_no_evaluation.content',
              type: 'yes',
              yes: 'modals.action_plan_no_evaluation.review_section',
              no: ''
            },
            () => {
              this.router.navigate(
                ['/pia', this.pia.id, 'section', 4, 'item', 5]
              );
            },
            () => {
              return false;
            }
          );
        }

        /* Modal for dpo page if all evaluations are not done yet */
        if (this.section.id === 4 && this.item.id === 3 && !this.sidStatusService.enableDpoValidation) {
          // this.modalsService.openModal('pia-dpo-missing-evaluations');
          this.dialogService.confirmThis(
            {
              text: 'modals.dpo_missing_evaluations.content',
              type: 'yes',
              yes: 'modals.action_plan_no_evaluation.review_section',
              no: ''
            },
            () => {
              this.router.navigate(
                ['/pia', this.pia.id, 'section', 4, 'item', 7]
              );
            },
            () => {
              return false;
            }
          );

        }
      });

      this.actionPlanService.data = this.data;
      this.actionPlanService.pia = pia;
      this.actionPlanService.listActionPlan();

      this.pia = pia;

      // Load PIA's revisions
      const revision = new Revision();
      revision.findAllByPia(this.pia.id).then(resp => {
        this.revisions = resp;
      });
    });

    // Update on knowledge base (scroll / content / search field)
    const knowledgeBaseScroll = document.querySelector('.pia-knowledgeBaseBlock-list');
    const knowledgeBaseContent = document.querySelector('.pia-knowledgeBaseBlock-searchForm input') as HTMLInputElement;
    if (knowledgeBaseContent) {
      knowledgeBaseScroll.scrollTop = 0;
      knowledgeBaseContent.value = '';
    }

    this.knowledgeBaseService.q = null;
    this.knowledgeBaseService.loadByItem(this.item);
    this.knowledgeBaseService.placeholder = null;
  }

  /********** REVISIONS ACTIONS ***********/
  /**
   * Create a new Revision record in indexDB
   */

  /**
   * Save revision as selection in revision service
   * and open a modal, waiting for confirmation
   * @param revisionId - The revision id
   */
  // onSelectedRevision(revisionId: number) {
  //   this.revisionService.prepareLoadRevision(revisionId, this.pia.id).then((createdAt: Date) => {
  //     this.modalsService.revisionDate = createdAt;
  //     // this.modalsService.openModal('revision-selection');
  //     this.dialogService.confirmThis(
  //       {
  //         text: 'modals.recover_version.message',
  //         type: 'confirm',
  //         yes: 'modals.recover_version.continue',
  //         no: ''
  //       },
  //       () => {
  //         this.loadPiaRevision();
  //       },
  //       () => {
  //         return false;
  //       }
  //     );
  //   });
  // }

  /**
   * On modal confirmation, replace current pia version by selected revision
   */
  // async loadPiaRevision() {
  //   localStorage.removeItem('revision-date-id');
  //   this.onNewRevision();
  //   this.revisionOverlay = true;
  //   this.revisionService.loadRevision().then(() => {
  //     this.revisionOverlay = false;
  //   });
  // }

  // onPreviewRevision(id) {
  //   this.revisionService.revisionSelected = id;
  //   this.revisionService.getRevisionById(id).then(revisionExport => {
  //     this.preview = revisionExport;
  //     this.preview.id = id;
  //     // this.modalsService.openModal('revision-preview-selection');
  //   });
  // }

  /********** END REVISIONS ACTIONS ***********/
}
